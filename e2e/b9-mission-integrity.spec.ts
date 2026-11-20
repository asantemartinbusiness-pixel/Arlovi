import { expect, test } from "@playwright/test";

const CLOCK = "clock=2026-11-14T09:30:00Z";

test("task evidence can only be a real record in the organisation", async ({ page }) => {
  await page.goto(`/o/northline/mission/missions/nl-missions-001/tasks?${CLOCK}`);
  await expect(page.locator("h1").first()).toBeVisible();
  const card = page.getByRole("button", { name: /owner / }).first();
  await card.dblclick();
  const dialog = page.getByRole("dialog");
  const picker = dialog.getByLabel("Attach evidence");
  await expect(picker).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Attach" })).toBeDisabled();
  await expect(picker.locator("option", { hasText: "zzz" })).toHaveCount(0);
});

test("library committed figure comes from the commitment records, like Budget", async ({ page }) => {
  await page.goto(`/o/northline/mission/missions/nl-missions-001/budget?${CLOCK}`);
  await expect(page.getByText("£1,050.00").first()).toBeVisible();
  await page.goto(`/o/northline/mission/missions?${CLOCK}`);
  await expect(page.getByText(/£1,050\.00/).first()).toBeVisible();
  await expect(page.getByText(/£0\.00 \/ £2,000\.00/)).toHaveCount(0);
});
