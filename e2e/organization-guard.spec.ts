import { expect, test } from "@playwright/test";

test("an unknown organization URL never displays another company's workspace", async ({ page }) => {
  await page.goto("/o/not-a-company/hq/home");
  await expect(page.getByRole("alert")).toContainText("Organization not found");
  await expect(page.getByRole("alert")).toContainText("No company records have been opened");
  await expect(page.getByRole("heading", { name: "Executive Home" })).toHaveCount(0);
  await page.getByRole("link", { name: "Return to the available workspace" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/hq\/home/);
});
