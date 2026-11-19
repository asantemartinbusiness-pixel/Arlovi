import { test, expect } from "@playwright/test";

test("flagship site is a working editorial experience with local-only CRM intake", async ({ page }) => {
  await page.goto("/showcase/northline-collective");
  await expect(page.getByRole("heading", { level: 1, name: "Spaces worth staying in." })).toBeVisible();
  await expect(page.getByRole("link", { name: /Open business workspace/ })).toHaveAttribute(
    "href", "/o/collective/hq/home",
  );

  const works = page.locator(".nc-work-card");
  await expect(works).toHaveCount(4);
  await page.getByRole("button", { name: "Objects", exact: true }).click();
  await expect(works).toHaveCount(1);
  await expect(page.getByText("Cove", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All work" }).click();
  await expect(works).toHaveCount(4);

  await page.getByPlaceholder("How should we address you?").fill("Demo Visitor");
  await page.getByPlaceholder("you@example.com").fill("demovisitor@example.com");
  await page.getByPlaceholder("Tell us a little about what you're imagining…").fill(
    "We are planning a quiet hospitality interior with an emphasis on material.",
  );
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Save enquiry in Arlovi" }).click();
  await expect(page.getByRole("status")).toContainText("Saved locally");

  const lead = await page.evaluate(async () => new Promise<{ title: string; parentId: string; org: string } | null>((resolve, reject) => {
    const open = indexedDB.open("arlovi-workspace");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction("records", "readonly");
      const request = tx.objectStore("records").getAll();
      request.onsuccess = () => {
        const found = request.result.find((row: { collection: string; title: string }) =>
          row.collection === "leads" && row.title === "Portfolio enquiry · Demo Visitor");
        resolve(found ? { title: found.title, parentId: found.parentId, org: found.organizationId } : null);
        database.close();
      };
      request.onerror = () => { reject(request.error); database.close(); };
    };
  }));
  expect(lead).toMatchObject({ title: "Portfolio enquiry · Demo Visitor", org: "org-northline-collective" });
  expect(lead?.parentId).toMatch(/^nc-web-contact-/);
});

for (const width of [390, 820, 1440]) {
  test("flagship portfolio reflows without horizontal overflow at " + width + "px", async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/showcase/northline-collective");
    await expect(page.getByRole("heading", { level: 1, name: "Spaces worth staying in." })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    if (width === 390) {
      await page.getByRole("button", { name: "Open menu" }).click();
      await expect(page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Work" })).toBeVisible();
      await page.getByRole("button", { name: "Close menu" }).click();
    }
  });
}
