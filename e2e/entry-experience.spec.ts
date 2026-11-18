import { expect, test } from "@playwright/test";

test("identity screens do not pretend cloud sign-in or invitation verification succeeded", async ({page}) => {
  await page.goto("/auth/sign-in");
  await expect(page.getByRole("heading",{name:"Welcome to Arlovi."})).toBeVisible();
  await page.getByLabel("Work email").fill("founder@example.com");
  await page.getByRole("button",{name:"Continue with email"}).click();
  await expect(page.getByRole("status")).toContainText("Cloud identity is not connected");
  await page.goto("/auth/invite?token=unverified");
  await expect(page.getByText("Your invitation is waiting.")).toBeVisible();
  await expect(page.getByText(/This browser does not grant membership from a link alone/)).toBeVisible();
});

test("browser workspace chooser distinguishes sample companies from locally created companies", async ({page}) => {
  await page.goto("/choose-workspace");
  await expect(page.getByRole("heading",{name:"Choose a workspace."})).toBeVisible();
  await expect(page.getByRole("heading",{name:"Sample environments"})).toBeVisible();
  await page.getByRole("link",{name:/Create a headquarters/}).click();
  await expect(page).toHaveURL(/\/setup/);
});
