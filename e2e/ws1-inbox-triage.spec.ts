import { expect, test, type Page } from "@playwright/test";

/*
 * WS1 — the unified inbox keeps read, acknowledge, snooze, resolve and decide
 * apart, filters by source and priority, and keeps the view when a person
 * leaves for a record and comes back.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const go = async (page: Page, path: string) => {
  await page.goto(`/o/northline${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);
  await expect(page.locator("h1").first()).toBeVisible();
};
const queue = (page: Page) => page.locator("#main").getByRole("table", { name: "Attention queue" });

test("filters live in the address and survive opening an approval and coming back", async ({ page }) => {
  await go(page, "/inbox/inbox");
  const main = page.locator("#main");
  await expect(queue(page).locator("tbody tr").first()).toBeVisible();

  await main.getByLabel("Source application").selectOption("Approvals");
  await expect(page).toHaveURL(/source=Approvals/);
  await expect(queue(page).locator("tbody tr").first()).toContainText("Approve:");
  const approvals = await queue(page).locator("tbody tr").count();
  expect(approvals).toBeGreaterThan(0);

  // Opening an approval goes straight to that request's review.
  const first = queue(page).locator("tbody tr").first();
  const title = (await first.locator("strong").first().innerText()).replace(/^Approve:\s*/, "");
  await first.click();
  await page.locator(".pg-actions").getByRole("button", { name: "Open record", exact: true }).click();
  await expect(page).toHaveURL(/\/inbox\/approvals/);
  await expect(page.getByRole("dialog")).toContainText(title);

  await page.goBack();
  await expect(page).toHaveURL(/\/inbox\/inbox.*source=Approvals/);
  await expect(main.getByLabel("Source application")).toHaveValue("Approvals");

  await main.getByLabel("Priority").selectOption("P1+");
  await page.reload();
  await expect(main.getByLabel("Priority")).toHaveValue("P1+");
  await expect(main.getByLabel("Source application")).toHaveValue("Approvals");
  await main.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/source=|priority=/);
});

test("read, unread, resolve and reopen are separate and persist", async ({ page }) => {
  await go(page, "/inbox/inbox");
  const main = page.locator("#main");
  const dialog = page.getByRole("dialog");
  // A derived, non-approval item: something the inbox can resolve on its own.
  await main.getByLabel("Source application").selectOption("Projects");
  await expect(page).toHaveURL(/source=Projects/);
  await expect(queue(page).locator("tbody tr").filter({ hasText: "Approve:" })).toHaveCount(0);
  const row = queue(page).locator("tbody tr").first();
  const title = await row.locator("strong").first().innerText();
  await row.getByRole("button", { name: /^Open row/ }).click();
  await expect(dialog).toContainText(title);
  await expect(dialog.getByText("What each action means")).toBeVisible();

  const readButton = dialog.getByRole("button", { name: "Mark read" });
  if (await readButton.count()) await readButton.click();
  await expect(dialog.getByRole("button", { name: "Mark unread" })).toBeVisible();
  await dialog.getByRole("button", { name: "Mark unread" }).click();
  await expect(dialog.getByText("Unread", { exact: true })).toBeVisible();

  await dialog.getByRole("button", { name: "Resolve", exact: true }).click();
  await expect(dialog.getByText("Resolved", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await main.getByRole("group", { name: "Queue filter" }).getByRole("button", { name: "Resolved" }).click();
  await expect(page).toHaveURL(/lens=resolved/);
  const resolved = queue(page).locator("tbody tr").filter({ hasText: title }).first();
  await expect(resolved).toBeVisible();
  await resolved.getByRole("button", { name: /^Open row/ }).click();
  await dialog.getByRole("button", { name: "Reopen" }).click();
  await expect(dialog.getByText("Resolved", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(queue(page).locator("tbody tr").filter({ hasText: title })).toHaveCount(0);
});

test("the inbox queue fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/inbox/inbox?lens=unread");
  const main = page.locator("#main");
  await expect(main.getByLabel("Source application")).toBeVisible();
  await expect(main.getByRole("group", { name: "Queue filter" }).getByRole("button", { name: "Unread" })).toHaveAttribute("aria-pressed", "true");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
