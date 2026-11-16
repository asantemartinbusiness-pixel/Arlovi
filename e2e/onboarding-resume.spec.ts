import { expect, test } from "@playwright/test";

test("first visit opens setup, saves progress and resumes after refresh", async ({ page }) => {
  await page.goto("/setup");
  await expect(page).toHaveURL(/\/setup/);
  await page.getByRole("textbox", { name: "Company name" }).fill("Independent Studio");
  await page.getByRole("textbox", { name: "Your name" }).fill("Taylor Morgan");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Company overview" }).fill("A multidisciplinary organization.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Company knowledge" }).fill("Protect customer data by default.");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Introduce your company to Arlovi." })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Company knowledge" }))
    .toHaveValue("Protect customer data by default.");
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("textbox", { name: "Company overview" }))
    .toHaveValue("A multidisciplinary organization.");
});

test("duplicate company addresses are rejected without creating another tenant", async ({ page }) => {
  await page.goto("/setup");
  await page.getByRole("textbox", { name: "Company name" }).fill("Northline");
  await page.getByRole("textbox", { name: "Your name" }).fill("Taylor Morgan");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("alert")).toContainText("available company address");
  await expect(page).toHaveURL(/\/setup/);
});
