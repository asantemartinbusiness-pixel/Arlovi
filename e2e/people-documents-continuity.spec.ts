import { expect, test } from "@playwright/test";

test("a People file shows only actual linked references and persists a new reference", async ({ page }) => {
  await page.goto("/o/northline/hr/employees");
  const employeeId = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString(), screenId: "qa-people-documents" };
    const employee = repo.newRecord({
      organizationId: "org-northline",
      collection: "employees", title: "QA Linked Documents Employee",
      status: "active", currency: "GBP",
      fields: { employment: "employee", title: "QA", leaveAllowance: 20, leaveTaken: 0 },
    }, context);
    await repo.putRecord(employee, context);
    return employee.id;
  });
  await page.goto(`/o/northline/hr/employees/${employeeId}`);
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  const main = page.locator("#main");
  await expect(main).toContainText("No document references filed");
  await expect(main).not.toContainText("Employment contract");

  await main.getByRole("button", { name: "Add a document reference" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a people-file reference" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Document").selectOption({ label: "Employment contract" });
  await dialog.getByLabel("Internal note").fill("Reference recorded for QA; no file uploaded");
  await dialog.getByRole("button", { name: "Save reference" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(main).toContainText("Employment contract");
  await expect(main).toContainText("Reference only");
  await page.reload();
  await page.getByRole("tab", { name: "Documents", exact: true }).click();
  await expect(page.locator("#main")).toContainText("Employment contract");

  const persisted = await page.evaluate(async (id) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const documents = await repo.listByCollection("org-northline", "documents");
    return documents.filter((record) => record.parentId === id && record.fields.employeeId === id)
      .map((record) => ({
        title: record.title,
        confidential: record.fields.confidential,
        referenceOnly: record.fields.referenceOnly,
        filedBy: record.fields.filedBy,
      }));
  }, employeeId);
  expect(persisted).toEqual([{
    title: "Employment contract", confidential: true, referenceOnly: true, filedBy: "Maya Chen",
  }]);
});

test("People, candidate and document detail URLs reject wrong collections and missing records", async ({ page }) => {
  const main = page.locator("#main");
  await page.goto("/o/northline/hr/employees/nl-applicants-001");
  await expect(main).toContainText("Employee unavailable");
  await page.goto("/o/northline/hr/candidates/nl-employees-001");
  await expect(main).toContainText("Candidate unavailable");
  await page.goto("/o/northline/hr/employees/does-not-exist");
  await expect(main).toContainText("Employee unavailable");
  await page.goto("/o/northline/docs/documents/nl-employees-001");
  await expect(main).toContainText("No document is open");
  await page.goto("/o/northline/docs/documents/does-not-exist");
  await expect(main).toContainText("No document is open");
  await page.goto("/o/harbor/hr/employees/nl-employees-001");
  await expect(main).toContainText("Employee unavailable");
});
