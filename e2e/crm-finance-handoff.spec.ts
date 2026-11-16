import { expect, test } from "@playwright/test";

test("a stale deal revision never leaves an orphan draft invoice in Finance", async ({page}) => {
  await page.goto("/o/northline/crm/deals/nl-deals-721");
  const outcome = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const original = await repo.getRecordInOrg("org-northline", "nl-deals-721");
    if (!original) throw new Error("Pike deal fixture unavailable");
    const ctx = { actor: "Browser QA", now: "2026-11-14T09:30:00Z", screenId: "qa-crm-handoff" };
    const invoice = repo.newRecord({
      organizationId: "org-northline", collection: "invoices", currency: "GBP",
      title: "INV-TEST-ROLLBACK", status: "draft", summary: "This must not exist after a conflict.",
      fields: { dealId: original.id, number: "INV-TEST-ROLLBACK" },
    }, ctx);
    const changed = {
      ...original, status: "won", revision: original.revision + 1,
      fields: { ...original.fields, stage: "won", invoiceId: invoice.id },
    };
    let conflict = false;
    try {
      await repo.putMany([changed, invoice], ctx, [], original.organizationId,
        { [original.id]: original.revision + 5 });
    } catch (error) {
      conflict = error instanceof repo.ConflictError;
    }
    const after = await repo.getRecordInOrg(original.organizationId, original.id);
    const orphan = await repo.getRecordInOrg(original.organizationId, invoice.id);
    return { conflict, orphan: Boolean(orphan), unchanged: after?.revision === original.revision,
      remainsOpen: after?.status === original.status };
  });
  expect(outcome).toEqual({ conflict: true, orphan: false, unchanged: true, remainsOpen: true });
});

test("native CRM deal cannot silently accept an unaccepted quote during closure", async ({page}) => {
  await page.goto("/o/northline/crm/deals/nl-deals-721");
  await page.locator(".pg-actions").getByRole("button", {name: "Close the deal"}).click();
  const dialog = page.getByRole("dialog", {name: "Close the deal"});
  await expect(dialog).toContainText("The quote has not been accepted by the customer");
  await expect(dialog.getByRole("button", {name: "Close won"})).toBeDisabled();
  await dialog.getByRole("button", {name: "Cancel"}).click();

  await page.goto("/o/northline/crm/quotes?tab=Review");
  await expect(page.getByRole("row", {name: /Q-126/})).toBeVisible();
  await expect(page.getByRole("row", {name: /Q-126/})).toContainText("REVIEW", {ignoreCase: true});
});
