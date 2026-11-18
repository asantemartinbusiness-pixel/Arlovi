import { expect, test } from "@playwright/test";

/*
 * WS2 — AI employee contract editing (ARL-TEAM-003): honest execution
 * availability, approval level, permitted actions and tool scopes that
 * persist across a reload, and the assignment history.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const AGENT = "/o/northline/team/agents/nl-agents-061";

test("execution availability is honest and the contract edits persist", async ({ page }) => {
  await page.goto(`${AGENT}?${CLOCK}`);
  await expect(page.getByRole("heading", { name: "Can it run work?" })).toBeVisible();
  await expect(page.getByText("Cannot execute", { exact: true })).toBeVisible();
  await expect(page.getByText(/No model provider is connected, so this AI employee cannot generate or execute anything/)).toBeVisible();

  await page.goto(`${AGENT}?tab=Permissions&${CLOCK}`);
  await expect(page.getByRole("heading", { name: "Permitted actions" })).toBeVisible();

  // A provider-bound scope cannot be granted while the provider is not connected.
  await expect(page.getByRole("checkbox", { name: /Send a supplier email/ })).toBeDisabled();

  // Change the approval level, add a permitted action and a scope.
  await page.getByRole("radio", { name: /Suggest only/ }).check();
  await page.getByRole("button", { name: "Add a permitted action" }).click();
  await page.getByRole("textbox", { name: "Permitted action 3" }).fill("Compare two supplier quotes");
  const add = page.getByRole("group", { name: "Add a tool scope" });
  await add.getByLabel("Identifier").fill("Suppliers Read");
  await add.getByLabel("Label").fill("Read supplier records");
  await add.getByRole("button", { name: "Add scope" }).click();
  await page.getByRole("checkbox", { name: /Read supplier records/ }).check();
  await expect(page.getByText(/unsaved change/)).toBeVisible();
  await expect(page.getByText("Tool scope added: suppliers.read (granted)")).toBeVisible();

  // An act scope cannot be granted below "Act with approval".
  await page.getByRole("combobox", { name: "Access for Read supplier records" }).selectOption("act");
  await page.getByRole("button", { name: "Save contract" }).click();
  await expect(page.getByText(/approval level does not allow acting/)).toBeVisible();
  await page.getByRole("combobox", { name: "Access for Read supplier records" }).selectOption("read");
  await page.getByRole("button", { name: "Save contract" }).click();
  await expect(page.getByText(/Saved · revision 2/)).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radio", { name: /Suggest only/ })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Permitted action 3" })).toHaveValue("Compare two supplier quotes");
  await expect(page.getByRole("checkbox", { name: /Read supplier records/ })).toBeChecked();

  // The work tab shows assignment history without claiming execution.
  await page.getByRole("tab", { name: "Work" }).click();
  await expect(page.getByRole("heading", { name: "Assignment history" })).toBeVisible();
  await expect(page.getByText(/none executed by a model/)).toBeVisible();
});

test.describe("narrow viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the contract editor fits a phone", async ({ page }) => {
    await page.goto(`${AGENT}?tab=Permissions&${CLOCK}`);
    await expect(page.getByRole("heading", { name: "Tool scopes" })).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("button", { name: "Save contract" })).toBeVisible();
  });
});
