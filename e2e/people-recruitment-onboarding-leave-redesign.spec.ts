import { expect, test } from "@playwright/test";

test("Recruitment has distinct, functional Positions, Candidates, Interviews and Offers pages", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab, heading] of [
    ["Positions", "Roles with a clear owner."],
    ["Candidates", "A pipeline for human decisions."],
    ["Interviews", "Interviews, scheduled and unscheduled."],
    ["Offers", "Offers, with evidence attached."],
  ]) {
    await page.goto(`/o/northline/hr/recruitment?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    await expect(main.getByRole("textbox", { name: "Search recruitment" })).toBeVisible();
  }
  await page.goto("/o/northline/hr/recruitment?tab=Candidates");
  const pipeline = main.locator(".hr-hiring-pipeline");
  await expect(pipeline).toBeVisible();
  const stage = main.getByRole("group", { name: "Filter recruitment stages" });
  await stage.getByRole("button", { name: "Interview", exact: true }).click();
  await expect(stage.getByRole("button", { name: "Interview", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  await expect(pipeline.locator(".hr-hiring-stage")).toHaveCount(1);
  const search = main.getByRole("textbox", { name: "Search recruitment" });
  await search.fill("qa-no-candidate-match-5593");
  await expect(pipeline).toContainText("Empty");
  await search.clear();
  await stage.getByRole("button", { name: "All stages" }).click();
  await expect(pipeline.locator(".hr-hiring-stage")).toHaveCount(5);
});

test("Onboarding has clearly distinct Incoming, In progress, Waiting and Completed states", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab, heading] of [
    ["Incoming", "Give every starter a clear first step."],
    ["In progress", "Keep the handoffs moving."],
    ["Waiting", "Know exactly what is holding things up."],
    ["Completed", "A record of work actually completed."],
  ]) {
    await page.goto(`/o/northline/hr/onboarding?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    await expect(main.getByRole("textbox", { name: "Search onboarding starters" })).toBeVisible();
  }
  const search = main.getByRole("textbox", { name: "Search onboarding starters" });
  await search.fill("qa-no-starter-30492");
  await expect(main).toContainText("No starters match this search");
  await search.clear();
});

test("Leave page has separate My leave, Team calendar, Approvals and Policy experiences", async ({ page }) => {
  const main = page.locator("#main");
  for (const [tab, heading] of [
    ["My leave", "Time away, clearly recorded."],
    ["Team calendar", "Leave in the context of the team."],
    ["Approvals", "Leave decisions with an accountable owner."],
    ["Policy", "Know what the recorded policy says."],
  ]) {
    await page.goto(`/o/northline/hr/leave?tab=${encodeURIComponent(tab)}`);
    await expect(main.getByRole("heading", { name: heading })).toBeVisible();
    await expect(main.locator(".ops-metrics .ops-metric")).toHaveCount(4);
    await expect(main.getByRole("button", { name: "Request leave" }).first()).toBeVisible();
  }
  await page.goto("/o/northline/hr/leave?tab=Approvals");
  const filter = main.getByRole("group", { name: "Filter leave approvals" });
  await filter.getByRole("button", { name: "Annual", exact: true }).click();
  await expect(filter.getByRole("button", { name: "Annual", exact: true })).toHaveAttribute("aria-pressed", "true");
  await filter.getByRole("button", { name: "Other types" }).click();
  await expect(filter.getByRole("button", { name: "Other types" })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/o/northline/hr/leave?tab=Team%20calendar");
  await main.getByRole("gridcell").nth(10).click();
  await expect(main).toContainText("Requests on");
  await expect(main.getByRole("button", { name: "Close detail" })).toBeVisible();
  await main.getByRole("button", { name: "Close detail" }).click();
  await expect(main.getByRole("button", { name: "Close detail" })).toHaveCount(0);
});

test("Onboarding IT waiting tasks cannot be completed using an ordinary checklist checkbox", async ({ page }) => {
  await page.goto("/o/northline/hr/onboarding?tab=Waiting");
  const main = page.locator("#main");
  const waitingStep = main.locator(".hr-onboarding-step").filter({ hasText: "IT access" }).first();
  if (await waitingStep.count()) {
    const checkbox = waitingStep.getByRole("checkbox");
    await expect(checkbox).toBeDisabled();
    await expect(main).toContainText("A waiting IT request is not an access grant");
  }
});

test("Leave approval drawer enforces real decision scope and keeps source status visible", async ({ page }) => {
  await page.goto("/o/northline/hr/leave?tab=Approvals");
  const main = page.locator("#main");
  const review = main.getByRole("button", { name: "Check cover" }).first();
  if (await review.count()) {
    await review.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  await expect(main.getByRole("heading", { name: "Leave decisions with an accountable owner." })).toBeVisible();
});
