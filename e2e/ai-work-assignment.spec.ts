import { test, expect } from "@playwright/test";

test("AI task assignment is durable and never implies that a model ran", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  await expect(page.getByRole("heading", { name: "AI work assignments" })).toBeVisible();
  await expect(page.getByText("Execution unavailable")).toBeVisible();
  const task = page.getByRole("combobox", { name: "Task to assign" });
  const agent = page.getByRole("combobox", { name: "AI employee" });
  const taskOption = await task.locator("option:not([value=''])").first().getAttribute("value");
  const agentOption = await agent.locator("option:not([value=''])").first().getAttribute("value");
  test.skip(!taskOption || !agentOption, "Seed requires an open task and an active AI employee");
  await task.selectOption(taskOption!);
  await agent.selectOption(agentOption!);
  const alreadyPending = await page.getByRole("button", { name: "Assign work" }).isDisabled();
  test.skip(alreadyPending, "Seed task already has a pending assignment");
  await page.getByRole("button", { name: "Assign work" }).click();
  await expect(page.getByText("Not executing").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Not executing").first()).toBeVisible();
  await page.getByRole("button", { name: "Prepare brief" }).first().click();
  await expect(page.getByText("Source brief —", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Local records, no generated model content")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).first().click();
  await expect(page.getByRole("heading", { name: "Previous assignments" })).toBeVisible();
});
