import { expect, test } from "@playwright/test";

/*
 * WS2 — Mission brief, milestones, timeline, participants and honest
 * execution status (ARL-MISSION-003 / ARL-MISSION-004).
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const MISSION = "/o/northline/mission/missions/nl-missions-060";

test("edit the brief, add a milestone and a participant; all persist", async ({ page }) => {
  await page.goto(`${MISSION}?${CLOCK}`);
  await expect(page.getByRole("heading", { name: "Mission brief" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Execution status" })).toBeVisible();
  await expect(page.getByText("Plan awaiting approval")).toBeVisible();
  await expect(page.getByText(/Nothing on this mission was produced by a model/)).toBeVisible();

  // Brief.
  await page.getByRole("button", { name: "Edit brief" }).click();
  const form = page.getByRole("form", { name: "Edit the mission brief" });
  await form.getByLabel("How success is judged").fill("");
  await form.getByRole("button", { name: "Save brief" }).click();
  await expect(form.getByText("Say how a person will know it succeeded.")).toBeVisible();
  await form.getByLabel("How success is judged").fill("Two suppliers compared on recorded terms and a decision recorded.");
  await form.getByLabel("Constraints").fill("Ceiling £800. No supplier is contacted from this workspace.");
  await form.getByRole("button", { name: "Save brief" }).click();
  await expect(page.getByText("Two suppliers compared on recorded terms and a decision recorded.")).toBeVisible();

  // Milestone.
  const milestones = page.getByRole("region", { name: "Milestones" });
  await milestones.getByRole("button", { name: "Add milestone" }).click();
  const ms = page.getByRole("form", { name: "New milestone" });
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(ms.getByText("Link at least one task, or there is nothing to measure it by.")).toBeVisible();
  await ms.getByRole("textbox", { name: /^Milestone/ }).fill("Terms compared");
  await ms.getByLabel("Due").fill("2026-11-30");
  await ms.getByRole("checkbox", { name: "Compare terms and write the note" }).check();
  await ms.getByRole("button", { name: "Add milestone" }).click();
  await expect(milestones.getByText("Terms compared")).toBeVisible();
  await expect(milestones.getByText(/of 4 reached/)).toBeVisible();

  // Participant.
  await page.getByRole("tab", { name: "Team" }).click();
  await page.getByRole("button", { name: "Add participant" }).click();
  const add = page.getByRole("form", { name: "Add a participant" });
  await add.getByRole("combobox", { name: "Person or AI employee" }).selectOption({ label: "Priya Shah" });
  await add.getByRole("combobox", { name: "Role" }).selectOption("approver");
  await add.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Role for Priya Shah" })).toHaveValue("approver");

  // Reload: brief, milestone and participant come back from storage.
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Role for Priya Shah" })).toHaveValue("approver");
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(page.getByText("Two suppliers compared on recorded terms and a decision recorded.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Milestones" }).getByText("Terms compared")).toBeVisible();

  // The plan timeline places it on a date axis.
  await page.goto(`${MISSION}/plan?tab=Timeline&${CLOCK}`);
  await expect(page.getByRole("heading", { name: "Milestones by date" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Terms compared" })).toBeVisible();
});

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("overview and timeline fit a phone", async ({ page }) => {
    await page.goto(`${MISSION}?${CLOCK}`);
    await expect(page.getByRole("heading", { name: "Mission brief" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.goto(`${MISSION}/plan?tab=Timeline&${CLOCK}`);
    await expect(page.getByRole("heading", { name: "Milestones by date" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
