import { expect, test } from "@playwright/test";

test("Roles & Permissions explores all application and screen contracts", async ({ page }) => {
  await page.goto("/o/northline/admin/roles?tab=Effective%20access");
  await expect(page.getByRole("heading", { name: "Understand every role. Control every surface." })).toBeVisible();
  await expect(page.getByText("316", { exact: true })).toBeVisible();
  await expect(page.locator(".ax-app")).toHaveCount(35);
  await page.getByRole("button", { name: /Client \/ Customer/ }).click();
  await expect(page.locator(".ax-app")).toHaveCount(35);
  await page.getByRole("checkbox", { name: "Suggested only" }).check();
  await expect(page.locator(".ax-app")).toHaveCount(3);
  await page.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(page.locator(".ax-no-results")).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator(".ax-app")).toHaveCount(3);
});

test("A finance role can open the app but not policy administration or developer credentials", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: "Finance", exact: true }).click();
  await page.goto("/o/northline/admin/roles");
  await expect(page.getByRole("heading", { name: "Page access restricted" })).toBeVisible();
  await expect(page.getByText(/manage policy permission/)).toBeVisible();
  await page.goto("/o/northline/admin/developer");
  await expect(page.getByRole("heading", { name: "Page access restricted" })).toBeVisible();
});

test("Client role sees only app-level access guidance, not confidential payroll detail", async ({ page }) => {
  await page.goto("/o/northline/workspace/apps");
  await page.getByRole("button", { name: /Profile and preferences/ }).click();
  await page.getByRole("menuitem", { name: "Client", exact: true }).click();
  await page.goto("/o/northline/hr/payroll");
  await expect(page.getByRole("heading", { name: "Application not available" })).toBeVisible();
  await expect(page.getByText(/Contact the organisation administrator/)).toBeVisible();
  await expect(page.getByText("Payslips", { exact: true })).toHaveCount(0);
});

test("Access explorer reflows without sideways scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/o/northline/admin/roles?tab=Effective%20access");
  await expect(page.locator(".ax-studio")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
