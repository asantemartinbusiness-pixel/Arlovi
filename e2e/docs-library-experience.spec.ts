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


test("Document editor displays lifecycle context and routes to review and publishing", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Docs Editor Lifecycle", status: "draft",
      fields: { kind: "document", folder: "Operations", confidential: false },
    }, context);
    await repo.putRecord(record, context);
    return record.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}`);
  const status = page.getByLabel("Document working status");
  await expect(status).toBeVisible();
  await expect(status).toContainText("CURRENT DOCUMENT");
  await expect(status).toContainText("draft");
  await status.getByRole("button", { name: "Review history" }).click();
  await expect(page).toHaveURL(/\/review/);
  await page.goto(`/o/northline/docs/documents/${id}`);
  await status.getByRole("button", { name: "Publishing" }).click();
  await expect(page).toHaveURL(/\/publish/);
});

test("Document review shows accountable readiness and toggles responsive panels", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Docs Review Status", status: "draft", fields: { kind: "document", folder: "Operations" },
    }, context);
    await repo.putRecord(record, context);
    return record.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}?tab=Review`);
  await expect(page.getByLabel("Document review readiness")).toBeVisible();
  await expect(page.getByLabel("Document review readiness")).toContainText("does not approve or publish");
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  await outline.click();
  await expect(outline).toHaveAttribute("aria-pressed", "true");
  const details = page.getByRole("button", { name: "Details", exact: true });
  await details.click();
  await expect(details).toHaveAttribute("aria-pressed", "true");
});


test("Documents never fall back to an unrelated record on an unknown document URL", async ({ page }) => {
  await page.goto("/o/northline/docs/documents/qa-doc-does-not-exist");
  await expect(page.locator("#main")).toContainText("No document is open");
  await expect(page.getByLabel("Document working status")).toHaveCount(0);
});
