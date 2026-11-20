import { expect, test, type Page } from "@playwright/test";

/*
 * W2A: Finance and CRM depth. Account profile in CRM Companies (follow-ups,
 * notes, lead-to-cash chain), budget variance drilldown with a saved
 * explanation, collections by customer with a promise to pay, and the
 * reconciliation ledger to date. Every write is checked after a reload.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const ORG = "/o/northline";
const go = (page: Page, path: string) => page.goto(`${ORG}${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);
const main = (page: Page) => page.locator("#main");
const dialog = (page: Page) => page.getByRole("dialog");

test("CRM account profile: chain into Finance, follow-up and note survive a reload", async ({ page }) => {
  await go(page, "/crm/companies?tab=All");
  await expect(page.getByRole("heading", { level: 1, name: "Companies" })).toBeVisible();
  await main(page).getByRole("link", { name: "Pike Lighting Trade" }).first().click();
  await expect(page).toHaveURL(/account=nl-companies-723/);
  await expect(main(page).getByRole("heading", { name: "Pike Lighting Trade" })).toBeVisible();
  await expect(main(page).getByText("Deals, quotes and invoices")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Pike trade account", exact: true })).toBeVisible();
  await expect(main(page).getByRole("list", { name: /Pike trade account/ })).toBeVisible();
  await expect(main(page).getByText(/Single-threaded: everything depends on Marcus Pike/)).toBeVisible();
  // Finance's invoice is reachable from the account timeline.
  await expect(main(page).getByRole("link", { name: /Invoice INV-1047/ })).toBeVisible();

  const form = main(page).getByRole("form", { name: "Add a follow-up" });
  await form.getByLabel("Follow-up").fill("Confirm the trade discount with Marcus");
  await form.getByLabel("Due").fill("2026-11-18");
  await form.getByLabel("Deal").selectOption({ index: 1 });
  await expect(form.getByLabel("Deal")).toContainText("Pike trade account");
  await form.getByRole("button", { name: "Add the follow-up" }).click();
  const tasks = main(page).getByRole("list", { name: "Open follow-ups" });
  await expect(tasks.getByText("Confirm the trade discount with Marcus")).toBeVisible();

  const note = main(page).getByRole("form", { name: "Add an account note" });
  await note.getByLabel("Account note").fill("Marcus decides; finance director signs above £5,000.");
  await note.getByRole("button", { name: "Save the note" }).click();
  await expect(main(page).getByRole("list", { name: "Account timeline" }).getByText("Marcus decides; finance director signs above £5,000.")).toBeVisible();

  await page.reload();
  await expect(main(page).getByRole("heading", { name: "Pike Lighting Trade" })).toBeVisible();
  await expect(tasks.getByText("Confirm the trade discount with Marcus")).toBeVisible();
  await expect(main(page).getByRole("list", { name: "Account timeline" }).getByText("Marcus decides; finance director signs above £5,000.")).toBeVisible();

  // Completing a follow-up moves it off the open list, durably.
  await tasks.getByRole("button", { name: "Mark Confirm the trade discount with Marcus done" }).click();
  await expect(tasks.getByText("Confirm the trade discount with Marcus")).toHaveCount(0);
  await page.reload();
  await expect(main(page).getByRole("heading", { name: "Pike Lighting Trade" })).toBeVisible();
  await expect(main(page).getByText("Confirm the trade discount with Marcus").first()).toBeVisible();
  await expect(main(page).getByRole("list", { name: "Open follow-ups" }).getByText("Confirm the trade discount with Marcus")).toHaveCount(0);

  // The timeline filter narrows to Finance records.
  await main(page).getByRole("group", { name: "Show" }).getByRole("button", { name: "Finance" }).click();
  await expect(main(page).getByRole("list", { name: "Account timeline" }).getByText("Trade terms call")).toHaveCount(0);
  await expect(main(page).getByRole("list", { name: "Account timeline" }).getByRole("link", { name: /Invoice INV-1047/ })).toBeVisible();

  // Back to the list; the deal page links to the account.
  await main(page).getByRole("button", { name: "All accounts" }).click();
  await expect(page).not.toHaveURL(/account=/);
  await go(page, "/crm/deals/nl-deals-721");
  await main(page).getByRole("link", { name: "Pike Lighting Trade" }).first().click();
  await expect(page).toHaveURL(/account=nl-companies-723/);
});

test("Budget variance: drill into the posted lines and keep an explanation", async ({ page }) => {
  await go(page, "/fin/budgets");
  await expect(page.getByRole("heading", { level: 1, name: "Budgets & Forecasts" })).toBeVisible();
  await expect(main(page).getByText("Posted with no budget line")).toBeVisible();
  await main(page).getByRole("button", { name: "Explain Professional fees · November" }).click();
  await expect(dialog(page).getByText("What makes up the actual", { exact: false })).toBeVisible();
  await expect(dialog(page).getByText("Adverse").first()).toBeVisible();
  await dialog(page).getByLabel("Variance explanation").fill("Year-end audit fee billed in November.");
  await dialog(page).getByRole("button", { name: "Save explanation" }).click();
  await expect(dialog(page).getByText(/Last explained by/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Budgets & Forecasts" })).toBeVisible();
  await main(page).getByRole("button", { name: "Explain Professional fees · November" }).click();
  await expect(dialog(page).getByLabel("Variance explanation")).toHaveValue("Year-end audit fee billed in November.");
});

test("Collections: record a promise to pay and see it on the worklist after a reload", async ({ page }) => {
  await go(page, "/fin/invoices?tab=Overdue");
  await expect(page.getByRole("heading", { level: 1, name: "Invoice List" })).toBeVisible();
  const worklist = main(page).getByRole("table", { name: "Collections by customer" }).or(main(page).locator("[aria-label='Collections by customer']")).first();
  await expect(worklist).toBeVisible();
  await expect(worklist.getByText("Marcus Pike")).toBeVisible();
  await main(page).getByRole("button", { name: "Record a promise from Marcus Pike" }).click();
  await expect(dialog(page).getByText("A promise is a note, not a payment")).toBeVisible();
  await dialog(page).getByLabel("Promised by").fill("2026-11-10");
  await expect(dialog(page).getByRole("button", { name: "Record the promise" })).toBeDisabled();
  await dialog(page).getByLabel("Promised by").fill("2026-11-21");
  await dialog(page).getByLabel("What they said").fill("Paying on the Friday run.");
  await dialog(page).getByRole("button", { name: "Record the promise" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(worklist.getByText("By 21 Nov 2026")).toBeVisible();
  await page.reload();
  await expect(main(page).getByText("Who to chase, by customer")).toBeVisible();
  await expect(main(page).getByText("By 21 Nov 2026")).toBeVisible();
  await expect(main(page).getByText(/Promised for 2026-11-21/).first()).toBeVisible();
});

test("Reconciliation separates the ledger to date from the ledger at the statement end", async ({ page }) => {
  await go(page, "/fin/reconciliation");
  await expect(main(page).getByText("statement-2026-11.csv")).toBeVisible();
  await expect(main(page).getByText("Ledger at statement end").first()).toBeVisible();
  await expect(main(page).getByText("Every posted journal on 1000, to date")).toBeVisible();
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("account profile and collections fit a phone without sideways scrolling", async ({ page }) => {
    await go(page, "/crm/companies?tab=All&account=nl-companies-723");
    await expect(main(page).getByRole("heading", { name: "Pike Lighting Trade" })).toBeVisible();
    await expect(main(page).getByRole("form", { name: "Add a follow-up" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    await go(page, "/fin/invoices?tab=Overdue");
    await expect(main(page).getByText("Who to chase, by customer")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
