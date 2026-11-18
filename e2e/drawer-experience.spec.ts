import { expect, test } from "@playwright/test";

const budgetRoute = "/o/northline/fin/budgets?clock=2026-11-14T09:30:00Z";

test("variance drawer keeps evidence and actions in distinct regions", async ({ page }) => {
  await page.goto(budgetRoute);
  const explain = page.getByRole("button", { name: /^Explain / }).first();
  await expect(explain).toBeVisible();
  await explain.click();

  const drawer = page.getByRole("dialog", { name: "Explain a variance" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("region", { name: "Budget variance overview" })).toBeVisible();
  await expect(drawer.getByRole("group", { name: "Budget versus actual" })).toBeVisible();
  await expect(drawer.getByText("Posted actual")).toBeVisible();
  await expect(drawer.locator(".ds-drawer-foot")).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Open General Ledger" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Close panel" })).toBeVisible();

  // A normal close retains the underlying budget location and its filters.
  await drawer.getByRole("button", { name: "Close panel" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/fin\/budgets/);
});

test("variance draft asks before losing work on Escape or close", async ({ page }) => {
  await page.goto(budgetRoute);
  await page.getByRole("button", { name: /^Explain / }).first().click();
  const drawer = page.getByRole("dialog", { name: "Explain a variance" });
  const explanation = drawer.getByRole("textbox", { name: "Variance explanation" });
  await expect(explanation).toBeVisible();
  await explanation.fill("Timing difference: confirm the posted invoices at month-end.");

  await expect(drawer.getByRole("button", { name: "Open General Ledger" })).toBeDisabled();
  await page.keyboard.press("Escape");
  const warning = page.getByRole("dialog", { name: "Discard unsaved changes?" });
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Keep editing" }).click();
  await expect(drawer).toBeVisible();
  await expect(explanation).toHaveValue("Timing difference: confirm the posted invoices at month-end.");

  await drawer.getByRole("button", { name: "Close panel" }).click();
  await expect(warning).toBeVisible();
  await warning.getByRole("button", { name: "Discard changes" }).click();
  await expect(drawer).toHaveCount(0);
});

test("shared drawer retains accessible controls on phone-sized viewports", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(budgetRoute);
  await page.getByRole("button", { name: /^Explain / }).first().click();
  const drawer = page.getByRole("dialog", { name: "Explain a variance" });
  await expect(drawer).toBeVisible();
  const edges = await drawer.boundingBox();
  expect(edges).not.toBeNull();
  expect(edges!.x).toBeGreaterThanOrEqual(-1);
  expect(edges!.x + edges!.width).toBeLessThanOrEqual(391);
  await expect(drawer.getByRole("button", { name: "Close panel" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Open General Ledger" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
});
