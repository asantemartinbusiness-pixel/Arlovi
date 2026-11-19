import { expect, test } from "@playwright/test";

test("Small business integration goals preserve the native marketplace and allow scoped exploration", async ({ page }) => {
  await page.goto("/o/northline/connect/marketplace");
  const main = page.locator("#main");
  const guide = main.getByLabel("Guided integration setup");
  await expect(guide).toBeVisible();
  await expect(guide.getByText("What would you like Arlovi to help with?")).toBeVisible();
  const goals = guide.getByRole("group", { name: "Business goals" });
  await goals.getByRole("button", { name: /Understand my money/ }).click();
  await expect(goals.getByRole("button", { name: /Understand my money/ })).toHaveAttribute("aria-pressed", "true");
  await expect(guide.getByText("Stripe", { exact: true })).toBeVisible();
  await expect(main.getByRole("searchbox", { name: "Search integration capabilities" })).toBeVisible();
});

test("Secure provider setup never claims a working account when backend is not ready", async ({ page }) => {
  await page.goto("/o/northline/connect/marketplace");
  const guide = page.getByLabel("Guided integration setup");
  await guide.getByRole("button", { name: /Set up/ }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Connect");
  await dialog.getByRole("button", { name: /Continue/ }).click();
  await expect(dialog).toContainText(/This connection isn't ready yet|Authorise your/);
});
