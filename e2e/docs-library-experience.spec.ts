import { expect, test } from "@playwright/test";

test("Documents library presents distinct working states and filters across viewports", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Your document workspace." })).toBeVisible();
  await expect(main.getByLabel("Document library summary")).toBeVisible();
  for (const label of ["Active documents", "Drafts", "In review", "Confidential"]) {
    await expect(main.getByLabel("Document library summary")).toContainText(label);
  }
  const draftFilter = main.getByRole("button", { name: "Drafts", exact: true });
  await draftFilter.click();
  await expect(draftFilter).toHaveAttribute("aria-pressed", "true");
  await main.getByRole("button", { name: "Clear filters" }).click();
  await expect(draftFilter).toHaveAttribute("aria-pressed", "false");
  const sizing = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(sizing.pageWidth).toBeLessThanOrEqual(sizing.viewportWidth + 2);
});

test("Documents shared tab describes recorded local sharing, not another person's ownership", async ({ page }) => {
  await page.goto("/o/northline/docs/files?tab=Shared");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Recorded sharing activity." })).toBeVisible();
  await expect(main).toContainText("This does not mean a public link or external access exists.");
  await expect(main.getByRole("button", { name: "New document" }).first()).toBeVisible();
});

test("Documents library archive and search have distinct empty and filter reset states", async ({ page }) => {
  await page.goto("/o/northline/docs/files?tab=Archive");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "The document archive." })).toBeVisible();
  await main.getByRole("searchbox", { name: "Search" }).fill("unfindable-qa-archive-test-string");
  await expect(main.getByText("No documents match the filters")).toBeVisible();
  await main.getByRole("button", { name: "Clear filters" }).click();
  await expect(main.getByRole("searchbox", { name: "Search" })).toHaveValue("");
});
