import { expect, test } from "@playwright/test";

test("global search separates integration catalogue from connected records", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("button", { name: "Integrations", exact: true }).click();
  await expect(dialog.getByRole("note")).toContainText("Integration catalogue, not connected data");
  await expect(dialog.getByRole("note")).toContainText("external accounts are not searchable yet");
  const bank = dialog.getByRole("option", { name: /Bank feed/ });
  await expect(bank).toBeVisible();
  await expect(bank).toContainText("Not connected");
  await bank.click();
  await expect(page).toHaveURL(/\/o\/northline\/connect\/marketplace\?q=Bank/);
  await expect(page.getByRole("searchbox", { name: "Search integration capabilities" })).toHaveValue("Bank feed");
  await expect(page.getByLabel("Integration catalogue").getByText("Bank feed").first()).toBeVisible();
});

test("catalogue search results show their source but never pretend remote data exists", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("combobox").fill("Take a card payment");
  const option = dialog.getByRole("option", { name: /Take a card payment/ });
  await expect(option).toBeVisible();
  await option.hover();
  const preview = dialog.getByLabel("Selected result preview");
  await expect(preview).toContainText("Integration catalogue · No external data");
  await expect(preview).toContainText("Not connected");
  await expect(preview.getByRole("button", { name: "Explore integration" })).toBeVisible();
});

test("integration scope can recover to marketplace when a provider is not found", async ({ page }) => {
  await page.goto("/o/northline/workspace/home");
  await expect(page.locator(".hq-header")).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: /Search Northline/ });
  await dialog.getByRole("button", { name: "Integrations", exact: true }).click();
  await dialog.getByRole("combobox").fill("provider-never-connected-988");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await expect(dialog.getByRole("note")).toContainText("not connected data");
  await dialog.getByRole("button", { name: /Browse/ }).click();
  await expect(page).toHaveURL(/\/o\/northline\/connect\/marketplace$/);
});
