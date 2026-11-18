import { expect, test } from "@playwright/test";

/*
 * W2C — MISSION Plan → Timeline task bars (ARL-MISSION-004): dates are entered
 * by a person, validated, drawn as bars, checked against dependencies and kept
 * across a reload.
 */

const TIMELINE = "/o/northline/mission/missions/nl-missions-060/plan?tab=Timeline&clock=2026-11-14T09:30:00Z";

test("set task dates, see the bars and a dependency clash, and keep them after reload", async ({ page }) => {
  await page.goto(TIMELINE);
  const schedule = page.getByRole("region", { name: "Task schedule" });
  await expect(schedule.getByText("No task has a date yet")).toBeVisible();
  const list = schedule.getByRole("list", { name: "Task dates" });
  const rows = list.getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  const first = (await rows.nth(0).locator("strong").innerText()).trim();
  const second = (await rows.nth(1).locator("strong").innerText()).trim();

  // A due date before the start is refused.
  await list.getByRole("button", { name: `Set dates for ${first}` }).click();
  const form = schedule.getByRole("form", { name: `Dates for ${first}` });
  await form.getByLabel("Start").fill("2026-11-20");
  await form.getByLabel("Due").fill("2026-11-18");
  await form.getByRole("button", { name: "Save dates" }).click();
  await expect(form.getByText("The due date is before the start date.")).toBeVisible();
  await form.getByLabel("Due").fill("2026-11-24");
  await form.getByRole("button", { name: "Save dates" }).click();
  await expect(schedule.getByText("1 of", { exact: false })).toBeVisible();

  // The second task depends on the first; starting it early is flagged.
  await list.getByRole("button", { name: `Set dates for ${second}` }).click();
  const next = schedule.getByRole("form", { name: `Dates for ${second}` });
  await next.getByLabel("Start").fill("2026-11-21");
  await next.getByLabel("Due").fill("2026-11-28");
  await next.getByRole("button", { name: "Save dates" }).click();
  await expect(schedule.getByRole("img", { name: /Task bars from/ })).toBeVisible();
  await expect(schedule.getByText(`${second} starts before ${first} is due.`)).toBeVisible();

  await page.reload();
  const again = page.getByRole("region", { name: "Task schedule" });
  await expect(again.getByText(/2 of \d+ tasks have dates/)).toBeVisible();
  await expect(again.getByText(`${second} starts before ${first} is due.`)).toBeVisible();

  // Clearing a task's dates takes it off the timeline.
  await again.getByRole("list", { name: "Task dates" }).getByRole("button", { name: `Set dates for ${second}` }).click();
  await again.getByRole("form", { name: `Dates for ${second}` }).getByRole("button", { name: "Clear dates" }).click();
  await expect(again.getByText(/1 of \d+ tasks have dates/)).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the task schedule fits a phone", async ({ page }) => {
    await page.goto(TIMELINE);
    await expect(page.getByRole("region", { name: "Task schedule" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
