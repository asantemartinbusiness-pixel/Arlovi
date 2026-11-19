import { expect, test, type Page } from "@playwright/test";

/* WS1 — roles explained in plain language, searchable, and access requests reviewed with the exact change. */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const go = async (page: Page, path: string) => {
  await page.goto(`/o/northline${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);
  await expect(page.locator("h1").first()).toBeVisible();
};

test("capabilities are searchable and explained", async ({ page }) => {
  await go(page, "/admin/roles?tab=Effective%20access");
  const main = page.locator("#main");
  await main.getByRole("button", { name: "Current access preview" }).click();
  const rows = main.getByRole("table", { name: "Capabilities held by each role view" }).locator("tbody tr");
  await expect(rows).toHaveCount(14);
  await main.getByLabel("Search capabilities").fill("salaries");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("View payroll");
  await expect(rows.first()).toContainText("high risk");
  await main.getByLabel("Search capabilities").fill("");
  await main.getByLabel("Held by role").selectOption("sales");
  await expect(rows).toHaveCount(3);
});

test("an access request is declined only with a reason, approved with the exact change, and kept", async ({ page }) => {
  await go(page, "/admin/roles?tab=Exceptions");
  const main = page.locator("#main");
  const dialog = page.getByRole("dialog");
  const requests = main.getByRole("table", { name: "Access requests" });
  const priya = requests.getByRole("row").filter({ hasText: "Priya Shah" });
  await expect(priya).toContainText("Waiting");
  await priya.getByRole("button", { name: /^Open row/ }).click();
  await expect(dialog).toContainText("Post journal");
  await expect(dialog).toContainText("This includes high-risk capabilities");

  // Both decisions require an explicit reason; no one-click approval.
  await expect(dialog.getByRole("button", { name: "Decline" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Approve and change role" })).toBeDisabled();
  await dialog.getByRole("textbox", { name: "Decision rationale" }).fill("Approved for a documented journal review assignment.");
  await expect(dialog.getByRole("button", { name: "Approve and change role" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Approve and change role" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(requests.getByRole("row").filter({ hasText: "Priya Shah" })).toContainText("approved");
  await requests.getByRole("row").filter({ hasText: "Priya Shah" }).getByRole("button", { name: /^Open row/ }).click();
  await expect(dialog).toContainText("Decided by");
  await expect(dialog).toContainText("Maya Chen");
  await page.keyboard.press("Escape");

  // A new request goes into the same queue.
  await main.getByRole("button", { name: "Request access" }).click();
  await dialog.getByLabel("Who needs access").selectOption({ label: "Elena Voss · People" });
  await dialog.getByLabel("Role view requested").selectOption("finance");
  await dialog.getByLabel("Why").fill("Running payroll checks during the audit.");
  await dialog.getByRole("button", { name: "Send for review" }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(requests.getByRole("row").filter({ hasText: "Elena Voss" })).toContainText("Waiting");
});
