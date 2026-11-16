import { expect, test } from "@playwright/test";

test("account readiness shows local-only status and exports a tenant-limited archive",async({page})=>{
  await page.goto("/o/northline/workspace/account");
  await expect(page.getByRole("heading",{name:"Account & data readiness"})).toBeVisible();
  await expect(page.getByRole("heading",{name:/Local workspace/})).toBeVisible();
  await expect(page.getByText("Authenticated cloud identity")).toBeVisible();
  const exportButton=page.getByRole("button",{name:"Download company archive"});
  await expect(exportButton).toBeDisabled();
  await page.getByRole("checkbox",{name:/I understand this backup/}).check();
  const downloadPromise=page.waitForEvent("download");
  await exportButton.click();
  const download=await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^arlovi-northline-backup-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(page.getByText(/Archive prepared at/)).toBeVisible();
});

test("cloud readiness does not claim a valid login or server-access grant",async({page})=>{
  await page.goto("/o/northline/workspace/account");
  await expect(page.getByText("Cloud organisation membership")).toBeVisible();
  await expect(page.getByText("Server-enforced roles")).toBeVisible();
  await expect(page.getByText("Not configured").first()).toBeVisible();
});
