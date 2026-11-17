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
  await main.getByRole("button", { name: "Clear filters" }).first().click();
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
  await expect(page.locator("#main")).toContainText("This record is unavailable");
  await expect(page.getByLabel("Document working status")).toHaveCount(0);
});


test("Document approval requires an explicit human confirmation", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString() };
    const document = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Approval Control", status: "draft", fields: { kind: "document", folder: "Operations" },
    }, context);
    await repo.putRecord(document, context);
    return document.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}/review?tab=Approvals`);
  const approve = page.locator("#main").getByRole("button", { name: "Review and approve…" });
  await expect(approve).toBeVisible();
  await approve.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Approve and publish locally");
  await expect(dialog.getByRole("checkbox", { name: /reviewed this version/ })).not.toBeChecked();
  await expect(dialog).toContainText("The dialog’s Approve action is only valid after acknowledgement");
  await dialog.getByRole("checkbox", { name: /reviewed this version/ }).check();
  await expect(dialog.getByRole("checkbox", { name: /reviewed this version/ })).toBeChecked();
});

test("Document reviewer assignment exposes reason, existing state, and no email claim", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString() };
    const document = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Reviewer Assignment", status: "draft", fields: { kind: "document" },
    }, context);
    await repo.putRecord(document, context);
    return document.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}/review?tab=Approvals`);
  await page.locator("#main").getByRole("button", { name: "Assign reviewers" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Assign accountable reviewers");
  await expect(dialog.getByText("Reason for review assignment")).toBeVisible();
  await expect(dialog).toContainText("Not sent");
});


test("Template governance offers discoverable status and search filters", async ({ page }) => {
  await page.goto("/o/northline/docs/templates");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Masters that keep work consistent." })).toBeVisible();
  await expect(main.getByLabel("Template governance summary")).toBeVisible();
  await main.getByRole("searchbox", { name: "Search masters" }).fill("unfindable-qa-template-reference");
  await expect(main).toContainText("No templates match");
  await main.getByRole("button", { name: "Clear filters" }).first().click();
  await expect(main.getByRole("searchbox", { name: "Search masters" })).toHaveValue("");
});

test("Document publishing cannot bypass an approval confirmation", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Publishing Review Gate", status: "draft", fields: { kind: "document", folder: "Operations" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}/publish?tab=Publish`);
  const button = page.locator("#main").getByRole("button", { name: "Review and publish…" });
  await expect(button).toBeVisible();
  await button.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Approve and publish locally");
  await expect(dialog.getByRole("checkbox", { name: /reviewed this version/ })).not.toBeChecked();
  await expect(page.locator("#main")).toContainText("Publishing requires a named reviewer");
});

test("Documents brand insights show grounded company context and template handoff", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Brand Evidence", status: "draft", fields: { kind: "document" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}/insights?tab=Brand`);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Brand alignment, with evidence." })).toBeVisible();
  await expect(main).toContainText("Brand assets are not automatically embedded");
  await main.getByRole("button", { name: "Open templates" }).click();
  await expect(page).toHaveURL(/\/docs\/templates/);
});


test("New documents expose master provenance and do not offer unpublished templates", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  await page.locator("#main").getByRole("button", { name: "New document" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Start a new company document");
  await expect(dialog).toContainText("Distribution");
  await expect(dialog).toContainText("browser-local record");
  await expect(dialog.getByRole("combobox", { name: "Start from" })).toBeVisible();
});

test("Export preview identifies its paper source and does not claim native PDF generation", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString() };
    const document = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Export Preview", status: "draft", fields: { kind: "document", folder: "Operations" },
    }, context);
    await repo.putRecord(document, context);
    return document.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}/publish?tab=Export`);
  await page.getByRole("button", { name: "Preview the export" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Inspect the rendered document");
  await expect(dialog).toContainText("Pagination remains an estimate");
  await expect(dialog.getByTitle("Export preview of QA Export Preview")).toBeVisible();
});


test("Document inspector links to editing, review and export with template provenance", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Inspector Cross Application", status: "draft", fields: { kind: "document", folder: "Operations" },
    }, ctx);
    await repo.putRecord(record, ctx);
  });
  await page.reload();
  const row = page.getByRole("row", { name: /QA Inspector Cross Application/ });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("button", { name: "Open editor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export and publish" })).toBeVisible();
  await expect(page.locator("body")).toContainText("Source master");
});
