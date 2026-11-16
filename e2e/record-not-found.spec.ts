import { expect, test } from "@playwright/test";

test("a missing detail record displays a truthful missing-record state, not another person's record", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices/nonexistent-record-id-992448");
  await expect(page.getByRole("heading", { name: "Record not found" })).toBeVisible();
  await expect(page.getByText("No other record was substituted.")).toBeVisible();
  await page.getByRole("button", { name: "Return to Finance" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\//);
});

test("a foreign company detail ID is blocked before its editor is mounted", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const row = (await repo.listByCollection("org-harbor", "invoices"))[0];
    return row?.id;
  });
  test.skip(!id, "No Harbor test invoice exists");
  await page.goto("/o/northline/fin/invoices/" + id);
  await expect(page.getByText("This record belongs to another organisation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record not found" })).toHaveCount(0);
});
