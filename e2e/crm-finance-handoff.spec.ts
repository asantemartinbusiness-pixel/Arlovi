import { expect, test } from "@playwright/test";

test("a stale deal revision never leaves an orphan draft invoice in Finance", async ({page}) => {
  await page.goto("/o/northline/crm/deals/nl-deals-721");
  await expect(page.locator("#main")).toContainText("Pike trade account");
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
  await expect(page.locator("#main")).toContainText("Pike trade account");
  await page.locator(".pg-actions").getByRole("button", {name: "Close the deal"}).click();
  const dialog = page.getByRole("dialog", {name: "Close the deal"});
  await expect(dialog).toContainText("The quote has not been accepted by the customer");
  await expect(dialog.getByRole("button", {name: "Close won"})).toBeDisabled();
  await dialog.getByRole("button", {name: "Cancel"}).click();

  await page.goto("/o/northline/crm/quotes?tab=Review");
  await expect(page.locator("#main").getByText("Q-126", {exact:true}).first()).toBeVisible();
  await expect(page.locator("#main")).toContainText(/review/i);
});

test("accepted quote evidence flows through a won CRM deal into the real Finance draft", async ({page}) => {
  test.setTimeout(120_000);
  const runAction = async (label: string) => {
    const bar = page.locator(".pg-actions");
    const direct = bar.getByRole("button", {name: label, exact: true});
    if (await direct.isVisible().catch(() => false)) {
      await direct.click();
      return;
    }
    await bar.getByRole("button", {name: "More actions"}).click();
    await page.getByRole("menuitem", {name: label, exact: true}).click();
  };

  await page.goto("/o/northline/crm/quotes?tab=Review");
  await expect(page.locator("#main").getByText("Q-126", {exact:true}).first()).toBeVisible();
  await page.locator("#main").getByText("Q-126", {exact:true}).first().click();
  await runAction("Approve");
  await page.getByRole("dialog").getByRole("button", {name: "Approve the quote"}).click();
  await expect(page.locator("#main")).toContainText(/approved/i);

  await page.locator("#main").getByText("Q-126", {exact:true}).first().click();
  await runAction("Send");
  await page.getByRole("dialog").getByRole("button", {name: "Issue and queue the message"}).click();
  await page.getByRole("tab", {name: "Sent"}).click();
  await expect(page.locator("#main").getByText("Q-126", {exact:true}).first()).toBeVisible();
  await page.locator("#main").getByText("Q-126", {exact:true}).first().click();
  await runAction("Record customer acceptance");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("No email, signature platform or external customer identity has been verified");
  await dialog.getByLabel("Accepted by").fill("Marcus Pike");
  await dialog.getByLabel("Acceptance reference").fill("Signed order confirmation Q-126 received by the team");
  await dialog.getByRole("button", {name: "Record customer acceptance"}).click();
  await expect(dialog).toHaveCount(0);

  await page.goto("/o/northline/crm/quotes?tab=Accepted");
  await expect(page.locator("#main").getByText("Q-126", {exact:true}).first()).toBeVisible();
  await page.goto("/o/northline/crm/deals/nl-deals-721");
  await expect(page.locator("#main")).toContainText("Pike trade account");
  await runAction("Close the deal");
  await expect(page.getByRole("dialog")).toContainText("Q-126 (accepted)");
  await page.getByRole("dialog").getByRole("button", {name: "Close won"}).click();
  await expect(page).toHaveURL(/\/o\/northline\/fin\/invoices\/[0-9a-f-]{36}$/);
  await expect(page.locator("#main")).toContainText("Not posted to Finance");
  const invoiceUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(invoiceUrl);
  await expect(page.locator("#main")).toContainText("Not posted to Finance");
  await page.goto("/o/northline/crm/deals/nl-deals-721");
  await expect(page.locator("#main")).toContainText(/closed won/i);
  await expect(page.locator("#main")).toContainText("Invoiced");
});
