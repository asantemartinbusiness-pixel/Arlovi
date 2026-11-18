import { expect, test } from "@playwright/test";

test("four-stage company blueprint saves progress and resumes after refresh", async ({ page }) => {
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Tell us about your company." })).toBeVisible();
  await page.getByRole("textbox", { name: "Company name" }).fill("Independent Studio");
  await page.getByRole("textbox", { name: "Your name" }).fill("Taylor Morgan");
  await page.getByRole("textbox", { name: "What does your company do?" }).fill("A multidisciplinary organization.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "How does your company work?" })).toBeVisible();
  await page.getByRole("combobox", { name: "Main type of business" }).selectOption("creative");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Prepare your people and tools." })).toBeVisible();
  await page.getByText("Company Brain knowledge", { exact: true }).click();
  await page.getByRole("textbox", { name: "Key company knowledge or operating instructions" }).fill("Protect customer data by default.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Prepare your people and tools." })).toBeVisible();
  await page.getByText("Company Brain knowledge", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Key company knowledge or operating instructions" })).toHaveValue("Protect customer data by default.");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("combobox", { name: "Main type of business" })).toHaveValue("creative");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("textbox", { name: "What does your company do?" })).toHaveValue("A multidisciplinary organization.");
});

test("duplicate company addresses are rejected without creating another tenant", async ({ page }) => {
  await page.goto("/setup");
  await page.getByRole("textbox", { name: "Company name" }).fill("Northline");
  await page.getByRole("textbox", { name: "Your name" }).fill("Taylor Morgan");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("available company address");
  await expect(page).toHaveURL(/\/setup/);
});
