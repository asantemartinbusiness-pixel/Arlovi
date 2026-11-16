import { expect, test } from "@playwright/test";

/** Shared mutations must reject foreign company IDs within the transaction. */
test("cross-organization edits, deletions, upserts and bulk writes are blocked", async ({ page }) => {
  await page.goto("/o/northline/hq/home");
  await expect(page.locator("#main")).toBeVisible();

  const result = await page.evaluate(async () => {
    // Load the same Vite modules used by the active React workspace.
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const harbor = (await repo.listByOrg("org-harbor"))[0];
    if (!harbor) return { missingFixture: true };
    const context = { actor: "Isolation test", now: "2026-11-16T00:00:00Z" };
    const blocked: string[] = [];
    async function reject(name: string, run: () => Promise<unknown>) {
      try { await run(); } catch (error) {
        if (error instanceof repo.OrganizationScopeError) blocked.push(name);
        else throw error;
      }
    }

    await reject("patch", () => repo.patchRecord(harbor.id, { title: "BAD CROSS-TENANT PATCH" }, context, {
      expectedOrganizationId: "org-northline",
    }));
    await reject("delete", () => repo.deleteRecord(harbor.id, context, undefined, "org-northline"));
    await reject("bulkPut", () => repo.putMany([{ ...harbor, title: "BAD CROSS-TENANT BULK" }], context, [], "org-northline"));
    await reject("idCollision", () => repo.putRecord({ ...harbor, organizationId: "org-northline", title: "BAD ID COLLISION" }, context));

    const unchanged = await repo.getRecord(harbor.id);
    const unrelatedRead = await repo.getRecordInOrg("org-northline", harbor.id);
    return {
      missingFixture: false, blocked, preservedTitle: unchanged?.title === harbor.title,
      preservedOrg: unchanged?.organizationId === harbor.organizationId,
      unrelatedRead: unrelatedRead === undefined,
    };
  });
  expect(result.missingFixture).toBe(false);
  expect(result.blocked).toEqual(["patch", "delete", "bulkPut", "idCollision"]);
  expect(result.preservedTitle).toBe(true);
  expect(result.preservedOrg).toBe(true);
  expect(result.unrelatedRead).toBe(true);
});

test("opening another company's record URL does not display that record", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  const targetId = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const harborInvoices = await repo.listByCollection("org-harbor", "invoices");
    return harborInvoices[0]?.id ?? null;
  });
  test.skip(!targetId, "No seeded Harbor invoice is available in this environment");
  await page.goto("/o/northline/fin/invoices/" + targetId);
  await expect(page.getByText("This record belongs to another organisation")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Not in Northline Atelier" })).toBeVisible();
});
