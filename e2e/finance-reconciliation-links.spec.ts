import { expect, test } from "@playwright/test";

test("a posted cash journal can be matched exactly, without a second ledger posting", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/o/northline/fin/reconciliation?tab=To%20reconcile");
  await expect(page.locator("#main")).toContainText("Statement closing");

  const ids = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const org = "org-northline";
    const accounts = await repo.listByCollection(org, "accounts");
    const bank = accounts.find((row) => String(row.fields.code) === "1000");
    const receivable = accounts.find((row) => String(row.fields.code) === "1100");
    if (!bank || !receivable) throw new Error("Expected cash and receivables accounts");
    const ctx = {actor:"Browser QA",now:"2026-11-14T09:30:00.000Z",screenId:"qa-reconcile"};
    const journal = repo.newRecord({
      organizationId:org,collection:"journals",currency:"GBP",title:"QA exact-match receipt",
      status:"posted",summary:"Locally recorded bank receipt for matching.",
      amountMinor:12345,at:"2026-11-14T09:00:00.000Z",
      fields:{date:"2026-11-14",source:"payment"},
      body:{date:"2026-11-14",memo:"QA exact-match receipt",lines:[
        {accountId:bank.id,debitMinor:12345,creditMinor:0},
        {accountId:receivable.id,debitMinor:0,creditMinor:12345},
      ]},
    },ctx);
    const bankLine = repo.newRecord({
      organizationId:org,collection:"bankTransactions",currency:"GBP",title:"QA exact-match bank line",
      status:"unmatched",summary:"Imported statement line not yet verified.",
      amountMinor:12345,at:"2026-11-14T00:00:00.000Z",
      fields:{matched:false,source:"statement-import",bankAccountCode:"1000",reference:"QA exact-match receipt"},
    },ctx);
    await repo.putMany([journal,bankLine],ctx,[],org);
    return {journalId:journal.id,lineId:bankLine.id};
  });

  const item = page.locator(".ds-card").filter({hasText:"QA exact-match bank line"}).first();
  await expect(item).toBeVisible();
  await expect(item).toContainText("QA exact-match receipt");
  await item.getByRole("button", {name:"Match",exact:true}).click();
  await expect.poll(async () => page.evaluate(async ({lineId,journalId}) => {
    const modulePath="/src/platform/repo.ts";
    const repo=await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const line=await repo.getRecordInOrg("org-northline",lineId);
    const journal=await repo.getRecordInOrg("org-northline",journalId);
    return {
      matched:line?.fields.matched,
      journalId:line?.fields.journalId,
      bankLineId:journal?.fields.bankLineId,
      status:journal?.status,
      revision:journal?.revision,
    };
  },ids)).toEqual({
    matched:true,journalId:ids.journalId,bankLineId:ids.lineId,status:"posted",revision:2,
  });
});
