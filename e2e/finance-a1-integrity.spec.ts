import { expect, test, type Page } from "@playwright/test";

/* Finance overlays commit related records together, against the revisions they opened with. */

async function repoCall<T>(page: Page, fn: string, arg: unknown): Promise<T> {
  return page.evaluate(async ({ fn, arg }) => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const org = "org-northline";
    const ctx = { actor: "Browser QA", now: "2026-11-14T09:30:00.000Z", screenId: "qa-finance-integrity" };
    return new Function("repo", "org", "ctx", "arg", `return (async () => { ${fn} })();`)(repo, org, ctx, arg);
  }, { fn, arg }) as Promise<T>;
}

test("voiding with a stale invoice writes no reversal and reports no success", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/o/northline/fin/home");
  await expect(page.locator("#main")).toContainText("Cash on the ledger");
  const target = await repoCall<{ id: string; journalId: string }>(page, `
    const invoices = await repo.listByCollection(org, "invoices");
    const inv = invoices.find((row) => row.status === "awaiting_payment" && row.fields.journalId && !Number(row.fields.paidMinor ?? 0));
    if (!inv) throw new Error("no unpaid posted invoice in the seed");
    return { id: inv.id, journalId: String(inv.fields.journalId) };
  `, null);
  await page.goto(`/o/northline/fin/invoices/${target.id}?overlay=void%20reason`);
  const dialog = page.getByRole("dialog", { name: "Void or credit this invoice" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reason").fill("Raised in error");
  // Someone else changes the invoice after the dialog opened.
  await repoCall(page, `await repo.patchRecord(arg.id, { summary: "Edited elsewhere" }, ctx, {});`, target);
  await dialog.getByRole("button", { name: "Void the invoice" }).click();
  await expect(page.getByText("Invoice voided")).toHaveCount(0);
  const after = await repoCall<{ status: string; reversals: number; original: string }>(page, `
    const inv = await repo.getRecordInOrg(org, arg.id);
    const journals = await repo.listByCollection(org, "journals");
    return { status: inv.status, reversals: journals.filter((j) => j.fields.reversesId === arg.journalId).length, original: journals.find((j) => j.id === arg.journalId).status };
  `, target);
  expect(after).toEqual({ status: "awaiting_payment", reversals: 0, original: "posted" });
});

test("a payment run stops when a bill changed after it opened, and leaves out unapproved bills", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/o/northline/fin/bills");
  await expect(page.locator("#main")).toContainText("Payables ageing");
  const bill = await repoCall<{ id: string; title: string; journals: number }>(page, `
    const suppliers = await repo.listByCollection(org, "suppliers");
    const record = repo.newRecord({ organizationId: org, collection: "bills", currency: "GBP", title: "QA-BILL-1", status: "approved",
      summary: "Approved for the run", amountMinor: 5000, at: ctx.now, dueAt: ctx.now,
      fields: { number: "QA-BILL-1", supplierId: suppliers[0]?.id ?? "", approvedBy: "Browser QA", netMinor: 5000, taxMinor: 0 } }, ctx);
    await repo.putRecord(record, ctx);
    const journals = await repo.listByCollection(org, "journals");
    return { id: record.id, title: record.title, journals: journals.length };
  `, null);
  await page.goto("/o/northline/fin/bills?overlay=payment%20authorization");
  const dialog = page.getByRole("dialog", { name: "Record a payment run" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("QA-BILL-1");
  // A bill with no recorded approver is named and left out, never silently paid.
  await expect(dialog).toContainText(/left out of this run/);
  // Another session pays the bill after the run opened.
  await repoCall(page, `await repo.patchRecord(arg.id, { status: "paid", fields: { paidElsewhere: true } }, ctx, {});`, bill);
  await dialog.getByRole("button", { name: /^Record the payment of/ }).click();
  await expect(page.getByText("Payment recorded")).toHaveCount(0);
  const after = await repoCall<{ journals: number; hasPaymentJournal: boolean }>(page, `
    const journals = await repo.listByCollection(org, "journals");
    const b = await repo.getRecordInOrg(org, arg.id);
    return { journals: journals.length, hasPaymentJournal: Boolean(b.fields.paymentJournalId) };
  `, bill);
  expect(after).toEqual({ journals: bill.journals, hasPaymentJournal: false });
});

test("match candidates and the adjustment review open from a selected statement line", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/o/northline/fin/reconciliation?tab=To%20reconcile");
  await expect(page.locator("#main")).toContainText("Statement closing");
  await repoCall(page, `
    const accounts = await repo.listByCollection(org, "accounts");
    const bank = accounts.find((row) => String(row.fields.code) === "1000");
    const expense = accounts.find((row) => String(row.fields.code) === "6000");
    const batch = "qa-a1-" + crypto.randomUUID();
    const statement = repo.newRecord({ organizationId: org, collection: "bankTransactions", currency: "GBP", title: "QA A1 statement", status: "imported",
      summary: "QA", at: ctx.now, amountMinor: -7700,
      fields: { kind: "statement", source: "manual-csv", bankAccountCode: "1000", importBatch: batch, filename: "QA A1 statement", from: "2026-11-14", to: "2026-11-14", openingMinor: 0, closingMinor: -7700 } }, ctx);
    const journal = repo.newRecord({ organizationId: org, collection: "journals", currency: "GBP", title: "QA A1 candidate payment", status: "posted",
      summary: "QA", amountMinor: 7700, at: "2026-11-14T09:00:00.000Z", fields: { date: "2026-11-14", source: "manual" },
      body: { date: "2026-11-14", memo: "QA A1 candidate payment", lines: [
        { accountId: expense.id, debitMinor: 7700, creditMinor: 0 }, { accountId: bank.id, debitMinor: 0, creditMinor: 7700 } ] } }, ctx);
    const line = repo.newRecord({ organizationId: org, collection: "bankTransactions", currency: "GBP", title: "QA A1 statement line", status: "unmatched",
      summary: "QA", amountMinor: -7700, at: "2026-11-14T00:00:00.000Z",
      fields: { matched: false, source: "statement-import", bankAccountCode: "1000", importBatch: batch, statementId: statement.id, reference: "QA A1 candidate payment" } }, ctx);
    await repo.putMany([statement, journal, line], ctx, [], org);
    return true;
  `, null);
  const row = page.getByRole("button", { name: /QA A1 statement line/ });
  await expect(row).toBeVisible();
  await row.click();
  await page.locator(".pg-actions").getByRole("button", { name: "Match candidates" }).click();
  const candidates = page.getByRole("dialog", { name: "Candidates for this line" });
  await expect(candidates).toContainText("QA A1 candidate payment");
  await expect(candidates.getByRole("button", { name: "Match", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(candidates).toHaveCount(0);
  await page.locator(".pg-actions").getByRole("button", { name: "Create an adjustment" }).click();
  const adjustment = page.getByRole("dialog", { name: "Post an adjustment" });
  await expect(adjustment).toContainText("Journal that will be posted");
});
