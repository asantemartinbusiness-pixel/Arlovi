import { expect, test } from "@playwright/test";

test("a company can be created with departments, AI drafts and a mission", async ({ page }) => {
  const slug = "fresh-studio-" + Math.floor(Math.random() * 900000 + 100000);
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Bring your organization together." })).toBeVisible();
  await page.getByRole("textbox", { name: "Company name" }).fill(slug);
  await page.getByRole("textbox", { name: "Your name" }).fill("Workspace Owner");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Company overview" }).fill("Independent creative and operations studio.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Organize your headquarters." })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Plan your AI workforce." })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "First mission" }).fill("Plan next-quarter client growth.");
  await page.getByRole("button", { name: "Enter headquarters" }).click();
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/hq/home"));
  await expect(page.locator(".hq-orgswitch")).toContainText(slug);

  const counts = await page.evaluate(async (companySlug) => new Promise<Record<string, number>>((resolve, reject) => {
    const open = indexedDB.open("arlovi-workspace");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const request = database.transaction("records").objectStore("records").getAll();
      request.onsuccess = () => {
        type Item = { id: string; organizationId: string; collection: string; fields: Record<string, unknown> };
        const all = request.result as Item[];
        const orgId = all.find((record) => record.fields.slug === companySlug && record.collection === "organizations")?.id;
        const records = all.filter((record) => record.organizationId === orgId);
        const out: Record<string, number> = {};
        for (const name of ["organizations", "departments", "agents", "missions", "sources"]) out[name] = records.filter((r) => r.collection === name).length;
        resolve(out);
        database.close();
      };
      request.onerror = () => { database.close(); reject(request.error); };
    };
  }), slug);
  expect(counts.organizations).toBe(1);
  expect(counts.departments).toBeGreaterThan(0);
  expect(counts.agents).toBeGreaterThan(0);
  expect(counts.missions).toBe(1);
  expect(counts.sources).toBe(1);

  await page.reload();
  await expect(page.locator(".hq-orgswitch")).toContainText(slug);
});
