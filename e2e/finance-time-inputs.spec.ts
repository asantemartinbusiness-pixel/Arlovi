import { expect, test } from "@playwright/test";

test("Finance reviews approved Project time without creating an invoice or ledger posting", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Time%20inputs");
  const ids = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const employee = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Finance Time Employee", status: "active", fields: { title: "Analyst" },
    }, ctx);
    const project = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "projects",
      title: "QA Finance Time Project", status: "planning",
    }, ctx);
    const entry = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "shifts",
      title: "QA Approved Billable Hours", status: "approved",
      startAt: "2026-11-17T09:00:00.000Z",
      fields: { kind: "time", employeeId: employee.id, employeeName: employee.title,
        projectId: project.id, hours: 2.5, rateMinor: 6200,
        billable: true, approved: true, approvedBy: "Elena Voss" },
    }, ctx);
    const unpriced = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "shifts",
      title: "QA Unpriced Billable Hours", status: "approved",
      startAt: "2026-11-17T11:00:00.000Z",
      fields: { kind: "time", employeeId: employee.id, employeeName: employee.title,
        projectId: project.id, hours: 1, billable: true, approved: true, approvedBy: "Elena Voss" },
    }, ctx);
    await repo.putMany([employee, project, entry, unpriced], ctx, [], "org-northline");
    return { entry: entry.id, unpriced: unpriced.id };
  });
  await page.reload();
  const main = page.locator("#main");
  await expect(main).toContainText("QA Finance Time Employee");
  await expect(main).toContainText("QA Finance Time Project");
  await expect(main).toContainText("Ready for Finance review");
  await expect(main).toContainText("Agreed rate required");
  // Capture the invoice baseline after seeded demo records have loaded.
  // Finance review must not increase invoice or journal counts.
  const baseline = await page.evaluate(async () => {
    // Fixtures from every application now load in the background after start-up
    // (portal and analytics also add invoices), so wait for them before counting.
    const appsPath = "/src/applications/index.ts";
    await (await import(/* @vite-ignore */ appsPath) as typeof import("../src/applications/index")).loadAllSeeds();
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    return {
      invoices: (await repo.listByCollection("org-northline", "invoices")).length,
      journals: (await repo.listByCollection("org-northline", "journals")).length,
    };
  });

  const isMobile = await page.evaluate(() => window.matchMedia("(max-width: 767px)").matches);
  if (isMobile) {
    const card = main.locator("button.ds-record-card").filter({ hasText: "Ready for Finance review" }).first();
    await card.click();
  } else {
    const row = main.getByRole("row", { name: /Ready for Finance review/ }).filter({ hasText: "QA Finance Time Employee" });
    await row.click();
  }
  const drawer = page.getByRole("dialog", { name: "Review billable time input" });
  await expect(drawer).toContainText("QA Finance Time Project");
  await expect(drawer).toContainText("Illustrative net");
  await drawer.getByRole("button", { name: "Mark reviewed for billing" }).click();
  await expect(drawer).toHaveCount(0);
  await expect.poll(async () => page.evaluate(async (state) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const time = await repo.getRecord(state.entry);
    const invoices = await repo.listByCollection("org-northline", "invoices");
    const journals = await repo.listByCollection("org-northline", "journals");
    return {
      review: time?.fields.billingReviewStatus,
      reviewedBy: typeof time?.fields.billingReviewedBy === "string",
      status: time?.status,
      invoiceId: time?.fields.invoiceId ?? null,
      invoices: invoices.length,
      journals: journals.length,
    };
  }, ids)).toEqual({
    review: "ready", reviewedBy: true, status: "approved", invoiceId: null,
    invoices: baseline.invoices, journals: baseline.journals,
  });
  await expect(main).toContainText("Reviewed for invoice preparation");
});

test("Finance cannot mark unpriced time as reviewed for invoicing", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices?tab=Time%20inputs");
  await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const employee = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Unpriced Employee", status: "active",
    }, ctx);
    const project = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "projects",
      title: "QA Unpriced Project", status: "planning",
    }, ctx);
    const entry = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "shifts",
      title: "QA No Rate Entry", status: "approved",
      fields: { kind: "time", employeeId: employee.id, employeeName: employee.title,
        projectId: project.id, hours: 1.5, billable: true, approved: true },
    }, ctx);
    await repo.putMany([employee, project, entry], ctx, [], "org-northline");
  });
  await page.reload();
  const main = page.locator("#main");
  const isMobile = await page.evaluate(() => window.matchMedia("(max-width: 767px)").matches);
  if (isMobile) {
    const card = main.locator("button.ds-record-card").filter({ hasText: "QA Unpriced Employee" }).first();
    await card.click();
  } else {
    await main.getByRole("row", { name: /QA Unpriced Employee/ }).click();
  }
  const drawer = page.getByRole("dialog", { name: "Review billable time input" });
  await expect(drawer).toContainText("Agreed rate required");
  await expect(drawer.getByRole("button", { name: "Mark reviewed for billing" })).toHaveCount(0);
});
