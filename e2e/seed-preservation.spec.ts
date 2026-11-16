import { expect, test } from "@playwright/test";

test("an upgrade to the seed version does not erase customer-created records", async ({ page }) => {
  await page.goto("/o/northline/hq/home");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("arlovi-workspace");
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const database = open.result;
        const tx = database.transaction(["records", "meta"], "readwrite");
        const date = new Date().toISOString();
        tx.objectStore("records").put({
          id: "customer-document-upgrade-test",
          organizationId: "org-northline",
          collection: "documents",
          title: "Customer-created document to preserve",
          status: "active",
          ownerName: "Owner",
          summary: "Created before a seed version change",
          currency: "GBP",
          tags: ["customer"],
          fields: {},
          createdAt: date,
          updatedAt: date,
          revision: 1,
          createdBy: "Owner",
          updatedBy: "Owner",
          history: [],
        });
        tx.objectStore("meta").put({ id: "seed", value: 0 });
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.onerror = () => { database.close(); reject(tx.error); };
      };
    });
  });

  await page.reload();
  const title = await page.evaluate(async () => await new Promise<string | undefined>((resolve, reject) => {
    const open = indexedDB.open("arlovi-workspace");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction("records", "readonly");
      const request = tx.objectStore("records").get("customer-document-upgrade-test");
      request.onsuccess = () => { resolve(request.result?.title); database.close(); };
      request.onerror = () => { reject(request.error); database.close(); };
    };
  }));
  expect(title).toBe("Customer-created document to preserve");
});
