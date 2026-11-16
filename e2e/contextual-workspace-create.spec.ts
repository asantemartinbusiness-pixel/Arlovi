import { test, expect } from "@playwright/test";

test("creating a task inside a department preserves that department and survives reload", async ({ page }) => {
  await page.goto("/o/northline/workspace/spaces");
  const firstDepartment = page.locator('.ws-entry-list a[href*="/department/"]').first();
  await expect(firstDepartment).toBeVisible();
  await firstDepartment.click();
  const url = page.url();
  const departmentId = url.split("/").pop();
  await page.getByRole("button", { name: "Create in this space" }).click();
  await page.getByRole("textbox", { name: "Name" }).fill("Context-linked review");
  await page.getByRole("button", { name: "Create task" }).click();
  await expect(page.getByText("Context-linked review")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Context-linked review")).toBeVisible();
  const stored = await page.evaluate(async (id) => new Promise<{ organizationId: string; departmentId: unknown } | null>((resolve, reject) => {
    const open = indexedDB.open("arlovi-workspace");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction("records").objectStore("records").getAll();
      request.onsuccess = () => {
        const record = (request.result as Array<{ title: string; organizationId: string; fields: { departmentId?: string } }>).find(item => item.title === "Context-linked review" && item.fields.departmentId === id);
        resolve(record ? { organizationId: record.organizationId, departmentId: record.fields.departmentId } : null);
        db.close();
      };
      request.onerror = () => reject(request.error);
    };
  }), departmentId);
  expect(stored?.departmentId).toBe(departmentId);
});

test("creating a project from Work opens its authoritative project space", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  await page.getByRole("button", { name: "Create new" }).click();
  await page.getByRole("radio", { name: "Project" }).check();
  await page.getByRole("textbox", { name: "Name" }).fill("Workspace delivery plan");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/o\/northline\/workspace\/work\/project\//);
  await expect(page.getByRole("heading", { name: "Workspace delivery plan" })).toBeVisible();
});
