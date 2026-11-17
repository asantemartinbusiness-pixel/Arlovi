import { expect, test, type Page } from "@playwright/test";

/** Finance's real UI, not mocked posting or an inferred bank-provider response. */
async function useAction(page: Page, label: string) {
  const bar = page.locator(".pg-actions");
  const direct = bar.getByRole("button", {name: label, exact: true});
  if (await direct.isVisible().catch(() => false)) {
    await direct.click();
    return;
  }
  await bar.getByRole("button", {name: "More actions"}).click();
  await page.getByRole("menuitem", {name: label, exact: true}).click();
}

test("a posted Finance invoice settles in two real receipts and updates CRM contact", async ({page}) => {
  test.setTimeout(120_000);
  await page.goto("/o/northline/fin/invoices/nl-invoices-003");
  await expect(page.locator("#main")).toContainText("INV-1052");
  await useAction(page, "Approve and post");
  const approval = page.getByRole("dialog", {name: /Approve and post this invoice/});
  await expect(approval).toBeVisible();
  await approval.getByRole("button", {name: /Approve and post/}).click();
  await expect(page.locator("#main")).toContainText("awaiting payment", {ignoreCase: true});
  await page.reload();
  await expect(page.locator("#main")).toContainText("awaiting payment", {ignoreCase: true});

  await page.goto("/o/northline/fin/invoices/nl-invoices-003?tab=Payments");
  await expect(page.getByRole("button", {name:"Record a payment"})).toBeVisible();
  await page.getByRole("button", {name:"Record a payment"}).click();
  let dialog = page.getByRole("dialog", {name: "Record a payment"});
  await dialog.getByLabel("Amount received").fill("250.00");
  await dialog.getByRole("button", {name:"Post the receipt"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#main")).toContainText("Part paid", {ignoreCase:true});
  await expect(page.locator("#main")).toContainText("Receipt INV-1052");
  await expect(page.locator("#main")).toContainText("£350.00");

  await page.reload();
  await expect(page.locator("#main")).toContainText("£350.00");
  await page.getByRole("button", {name:"Record a payment"}).click();
  dialog = page.getByRole("dialog", {name:"Record a payment"});
  await expect(dialog).toContainText("£350.00");
  await dialog.getByRole("button", {name:"Post the receipt"}).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  // Money renders an em dash for zero; assert the settlement amount by label
  // rather than requiring a £0.00 string that the UI deliberately omits.
  await expect(page.locator("#main")).toContainText(/Outstanding\s*—/);
  await expect(page.getByRole("button", {name:"Record a payment"})).toBeDisabled();
  await expect(page.locator("#main")).toContainText("2 receipts posted against this invoice");

  await page.goto("/o/northline/crm/contacts/nl-contacts-003?tab=Service");
  await expect(page.locator("#main")).toContainText("INV-1052");
  await expect(page.locator("#main")).toContainText("paid", {ignoreCase: true});
  await page.goto("/o/northline/fin/ledger?tab=Journals");
  await expect(page.locator("#main")).toContainText("Issue INV-1052");
  await expect(page.locator("#main")).toContainText("Receipt INV-1052");
});

test("a concurrent invoice change leaves no orphan receipt journal", async ({page}) => {
  await page.goto("/o/northline/fin/invoices/nl-invoices-002");
  await expect(page.locator("#main")).toContainText("INV-1048");
  const result = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const invoice = await repo.getRecordInOrg("org-northline", "nl-invoices-002");
    if (!invoice) throw new Error("The seeded invoice is not available");
    const ctx = { actor:"Browser QA", now:"2026-11-14T09:30:00.000Z", screenId:"qa-finance" };
    const journal = repo.newRecord({
      organizationId:invoice.organizationId, collection:"journals", currency:invoice.currency,
      title:"Test blocked receipt",status:"posted", amountMinor:10000,
      fields:{source:"payment",invoiceId:invoice.id},
    }, ctx);
    const changed = {
      ...invoice, status:"part_paid", revision:invoice.revision+1,
      fields:{...invoice.fields,paidMinor:10000,paymentJournalId:journal.id},
    };
    let rejected = false;
    try {
      await repo.putMany([changed,journal],ctx,[],invoice.organizationId,
        {[invoice.id]:invoice.revision+1});
    } catch (error) {
      rejected = error instanceof repo.ConflictError;
    }
    const saved = await repo.getRecordInOrg(invoice.organizationId,invoice.id);
    const orphan = await repo.getRecordInOrg(invoice.organizationId,journal.id);
    return {
      rejected,
      orphan: Boolean(orphan),
      invoiceUnchanged: saved?.revision===invoice.revision && saved?.status===invoice.status,
    };
  });
  expect(result).toEqual({rejected:true,orphan:false,invoiceUnchanged:true});
});

test("paid historical invoices report zero amount due without manufacturing a receipt", async ({page}) => {
  await page.goto("/o/northline/fin/invoices/nl-invoices-001?tab=Payments");
  await expect(page.locator("#main")).toContainText("INV-1041");
  await expect(page.locator("#main")).toContainText(/Outstanding\s*—/);
  await expect(page.getByRole("button", {name:"Record a payment"})).toBeDisabled();
  await useAction(page,"Preview the document");
  await expect(page.getByRole("dialog")).toContainText("£0.00");
});
