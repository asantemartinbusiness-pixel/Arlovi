import { expect, test, type Page } from "@playwright/test";

/*
 * W2C — AUTO workflow builder (ARL-AUTO-002): a local test against a chosen
 * sample record shows the path taken step by step; a step's field reference is
 * checked against the trigger's records; an edit is saved and survives reload.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const BUILDER = `/o/northline/auto/workflows/nl-workflows-020?${CLOCK}`;

async function openBuilder(page: Page) {
  await page.goto(BUILDER);
  const sample = page.getByLabel("Sample record");
  // Wait until an overdue invoice has loaded, then test with it explicitly.
  const matching = sample.locator("option", { hasNotText: "does not match" }).nth(1);
  await expect(matching).toBeAttached();
  await sample.selectOption((await matching.getAttribute("value"))!);
  return sample;
}

test("local test follows the chosen record's path and performs nothing external", async ({ page }) => {
  const sample = await openBuilder(page);
  const localTest = page.locator("section.ds-card").filter({ has: page.getByRole("heading", { name: "Test the path with a sample record" }) });
  await expect(localTest.getByText("Local test — no external actions performed")).toBeVisible();

  // A matching invoice, with the approval assumed: the run reaches the email step and stops at the boundary.
  const first = await sample.locator("option").nth(1).getAttribute("value");
  await sample.selectOption(first!);
  await page.getByLabel("Decision assumed at Finance approves the chase").selectOption("approved");
  await page.getByRole("button", { name: "Run local test" }).click();
  const path = page.getByRole("list", { name: "Path taken" });
  await expect(path.getByText(/so the run took “when true”/)).toBeVisible();
  await expect(path.getByText(/Assumed approved for this test\. No decision was recorded/)).toBeVisible();
  await expect(path.getByText(/marked high impact and the run is a dry run, so it was not executed/)).toBeVisible();
  await expect(localTest.getByText(/Not reached on this path: Note that no chase was needed\./)).toBeVisible();

  // A record that does not match the trigger is still testable, and the trace says so.
  const outsider = await sample.locator("option", { hasText: "does not match the trigger" }).first().getAttribute("value");
  await sample.selectOption(outsider!);
  await page.getByRole("button", { name: "Run local test" }).click();
  await expect(path.getByText(/It does not match the trigger's event or filters, so a real run would not pick it/)).toBeVisible();

  // The run is a dry run: Run History gains nothing from it.
  await page.getByRole("tab", { name: "History" }).click();
  await expect(page.getByText(/Runs of this automation/)).toBeVisible();
  await expect(page.getByRole("cell", { name: "dry", exact: true })).toHaveCount(0);
});

test("a step's field is checked against the trigger's records; a fixed edit saves and survives reload", async ({ page }) => {
  await openBuilder(page);
  await page.getByRole("button", { name: "Run local test" }).click();
  // Open the condition from the path list.
  await page.getByRole("list", { name: "Path taken" }).getByRole("button", { name: /Older than 7 days/ }).click();
  const inspector = page.locator("section.auto-inspector");
  const field = inspector.getByRole("combobox", { name: "Field" });
  await expect(field).toHaveValue("overdueDays");

  await field.fill("record.amountMinr");
  await expect(inspector.getByText(/No invoices record carries amountMinr\. Did you mean record\.amountMinor\?/)).toBeVisible();
  const validation = page.locator("section.ds-card").filter({ has: page.getByRole("heading", { name: "Validation", exact: true }) });
  await expect(validation.getByText(/record\.amountMinr is not a known field/)).toBeVisible();

  await field.fill("overdueDays");
  await expect(validation.getByText(/record\.amountMinr is not a known field/)).toHaveCount(0);
  await inspector.getByRole("textbox", { name: "Value" }).fill("10");
  await page.getByRole("button", { name: "Save graph" }).first().click();
  await expect(page.getByText("saved", { exact: true }).first()).toBeVisible();

  await page.reload();
  await openBuilder(page);
  await page.getByRole("button", { name: "Run local test" }).click();
  await page.getByRole("list", { name: "Path taken" }).getByRole("button", { name: /Older than 7 days/ }).click();
  await expect(page.locator("section.auto-inspector").getByRole("textbox", { name: "Value" })).toHaveValue("10");
  await expect(page.getByRole("list", { name: "Path taken" }).getByText(/> 10 →/)).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the builder and its local test fit a phone", async ({ page }) => {
    await openBuilder(page);
    await page.getByRole("button", { name: "Run local test" }).click();
    await expect(page.getByRole("list", { name: "Path taken" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
