import { expect, test } from "@playwright/test";

test("company creation preserves departments, AI drafts, knowledge, permissions and the first objective", async ({ page }) => {
  const slug = "fresh-studio-" + Math.floor(Math.random() * 900000 + 100000);
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Tell us about your company." })).toBeVisible();
  await page.getByRole("textbox", { name: "Company name" }).fill(slug);
  await page.getByRole("textbox", { name: "Your name" }).fill("Workspace Owner");
  await page.getByRole("textbox", { name: "What does your company do?" }).fill("Independent creative and operations studio.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("combobox", { name: "Main type of business" }).selectOption("creative");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: /Colleagues/ }).fill("Sam Rivera");
  await page.getByText("Company Brain knowledge", { exact: true }).click();
  await page.getByRole("textbox", { name: "Key company knowledge or operating instructions" }).fill("We value transparent service and accessible design.");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Your headquarters is taking shape." })).toBeVisible();
  await page.getByRole("textbox", { name: "Your first business objective (optional)" }).fill("Plan next-quarter client growth.");
  await page.getByRole("button", { name: "Create my headquarters" }).click();
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/workspace/home"));
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
        const orgId = all.find(record => record.fields.slug === companySlug && record.collection === "organizations")?.id;
        const records = all.filter(record => record.organizationId === orgId);
        const out: Record<string, number> = {};
        for (const name of ["organizations","departments","agents","missions","sources","channels","policies","preferences","members"]) {
          out[name] = records.filter(record => record.collection === name).length;
        }
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
  expect(counts.sources).toBe(2);
  expect(counts.channels).toBeGreaterThan(0);
  expect(counts.policies).toBe(1);
  expect(counts.preferences).toBeGreaterThan(0);
  expect(counts.members).toBeGreaterThan(1);

  await page.goto("/o/" + slug + "/workspace/setup");
  await expect(page.getByRole("heading", { name: "Company Setup Centre" })).toBeVisible();
  await expect(page.getByText("invitations not sent")).toBeVisible();

  await page.reload();
  await expect(page.locator(".hq-orgswitch")).toContainText(slug);
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/workspace/home"));

  await page.evaluate(() => {
    localStorage.removeItem("arlovi-last-workspace");
    localStorage.removeItem("arlovi-local-organizations-v1");
  });
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/workspace/home"));
  const catalogue = await page.evaluate(() => localStorage.getItem("arlovi-local-organizations-v1"));
  expect(catalogue).toContain(slug);
});
