import { expect, test } from "@playwright/test";

test("a locally reconciled bank statement stores current evidence and flags later ledger changes", async ({page}) => {
  test.setTimeout(120_000);
  await page.goto("/o/northline/fin/reconciliation");
  await expect(page.locator("#main")).toContainText("Reconciliation");

  const recordId=await page.evaluate(async()=>{
    const modulePath="/src/platform/repo.ts";
    const repo=await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const financePath="/src/domain/fin-ledger.ts";
    const led=await import(/* @vite-ignore */ financePath) as typeof import("../src/domain/fin-ledger");
    const organizationId="org-northline";
    const accounts=await repo.listByCollection(organizationId,"accounts");
    const journals=await repo.listByCollection(organizationId,"journals");
    const account=accounts.find(row=>led.accountCode(row)==="1000");
    if(!account)throw new Error("No seeded bank account");
    const closing=journals.filter(row=>row.status==="posted"&&led.journalDate(row)<="2026-12-31")
      .flatMap(row=>led.journalLines(row))
      .filter(line=>line.accountId===account.id)
      .reduce((sum,line)=>sum+line.debitMinor-line.creditMinor,0);
    const ctx={actor:"Browser QA",now:"2026-11-16T23:10:00.000Z",screenId:"qa-reconciliation-signoff"};
    const statement=repo.newRecord({
      organizationId,collection:"bankTransactions",currency:"GBP",
      title:"QA reconciliation statement",status:"imported",summary:"Manually entered test statement.",
      at:ctx.now,amountMinor:closing,
      fields:{
        kind:"statement",source:"manual-csv",verification:"manual_local",
        filename:"QA reconciliation statement",bankAccountCode:"1000",
        importBatch:"qa-"+crypto.randomUUID(),from:"2026-12-31",to:"2026-12-31",
        openingMinor:closing,closingMinor:closing,
      },
    },ctx);
    await repo.putRecord(statement,ctx);
    return statement.id;
  });

  await page.reload();
  await expect(page.locator("#main")).toContainText("QA reconciliation statement");
  const bar=page.locator(".pg-actions");
  const action=bar.getByRole("button",{name:"Confirm the statement"});
  await action.click();
  const dialog=page.getByRole("dialog",{name:/Confirm/});
  await expect(dialog).toContainText("Local ledger evidence is complete");
  await dialog.getByLabel("Note").fill("QA checked against posted local ledger.");
  await dialog.getByRole("button",{name:"Confirm the statement"}).click();
  await expect(dialog).toHaveCount(0);
  await page.goto("/o/northline/fin/reconciliation?tab=History");
  await expect(page.locator("#main")).toContainText("QA reconciliation statement");
  await expect(page.locator("#main")).toContainText("Current");

  // A new posted movement dated inside the same bank statement period
  // supersedes the source snapshot, but never rewrites the prior signoff.
  await page.evaluate(async({recordId})=>{
    const modulePath="/src/platform/repo.ts";
    const repo=await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const accounts=await repo.listByCollection("org-northline","accounts");
    const bank=accounts.find(row=>String(row.fields.code)==="1000");
    const ar=accounts.find(row=>String(row.fields.code)==="1100");
    if(!bank||!ar)throw new Error("Required accounts missing");
    const ctx={actor:"Browser QA",now:"2026-11-16T23:10:00.000Z",screenId:"qa-reconciliation-signoff"};
    const movement=repo.newRecord({
      organizationId:"org-northline",collection:"journals",currency:"GBP",
      title:"Post-signoff ledger change for "+recordId,status:"posted",
      at:"2026-12-30T09:00:00.000Z",summary:"Test adjustment after signoff.",
      amountMinor:200,
      fields:{source:"manual",date:"2026-12-30"},
      body:{date:"2026-12-30",memo:"Post-signoff change",lines:[
        {accountId:bank.id,debitMinor:200,creditMinor:0},
        {accountId:ar.id,debitMinor:0,creditMinor:200},
      ]},
    },ctx);
    await repo.putRecord(movement,ctx);
  },{recordId});
  await expect(page.locator("#main")).toContainText("Superseded / unverified");
});

test("closed accounting periods reject newly posted journals in single and bulk writes", async({page})=>{
  await page.goto("/o/northline/fin/ledger?tab=Periods");
  await expect(page.locator("#main")).toContainText("Accounting periods");
  const result=await page.evaluate(async()=>{
    const modulePath="/src/platform/repo.ts";
    const repo=await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const org="org-northline",period="2025-01";
    const ctx={actor:"Browser QA",now:"2026-11-16T23:10:00.000Z",screenId:"qa-period-lock"};
    const prefs=await repo.listByCollection(org,"preferences");
    const existing=prefs.find(row=>row.fields.kind==="accountingPeriods");
    if(existing){
      const body=(existing.body??{}) as Record<string,unknown>;
      const locked=Array.isArray(body.locked)?body.locked.map(String):[];
      await repo.patchRecord(existing.id,{
        body:{...body,locked:[...new Set([...locked,period])]},
      },ctx,{expectRevision:existing.revision,expectedOrganizationId:org});
    }else{
      const pref=repo.newRecord({
        organizationId:org,collection:"preferences",currency:"GBP",
        title:"Accounting periods",status:"active",fields:{kind:"accountingPeriods"},
        body:{locked:[period]},
      },ctx);
      await repo.putRecord(pref,ctx);
    }
    const journal=repo.newRecord({
      organizationId:org,collection:"journals",currency:"GBP",
      title:"Forbidden closed-period posting",status:"posted",
      at:"2025-01-12T09:00:00.000Z",amountMinor:500,
      fields:{date:"2025-01",source:"manual"},
      body:{date:"2025-01-12",memo:"Should not post",lines:[]},
    },ctx);
    let single=false,bulk=false;
    try{await repo.putRecord(journal,ctx);}catch(e){single=String(e).includes("closed");}
    const linked=repo.newRecord({
      organizationId:org,collection:"bankTransactions",currency:"GBP",
      title:"Must roll back with journal",status:"unmatched",fields:{source:"qa"},
    },ctx);
    try{await repo.putMany([journal,linked],ctx,[],org);}catch(e){bulk=String(e).includes("closed");}
    return {
      single,bulk,
      posted:!!(await repo.getRecordInOrg(org,journal.id)),
      orphan:!!(await repo.getRecordInOrg(org,linked.id)),
    };
  });
  expect(result).toEqual({single:true,bulk:true,posted:false,orphan:false});
});
