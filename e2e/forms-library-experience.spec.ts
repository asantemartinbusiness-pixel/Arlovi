import { expect, test } from "@playwright/test";

test("Forms library retains hierarchy and recovers from empty search", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Forms and their responses." })).toBeVisible();
  await expect(main.getByLabel("Forms library overview")).toBeVisible();
  await expect(main.getByLabel("Forms activity summary")).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a form" }).fill("qa-no-form-matches-this");
  await expect(main.getByText("No forms match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a form" })).toHaveValue("");
});

test("Forms templates retain overview when a search finds no templates", async ({ page }) => {
  await page.goto("/o/northline/forms/forms?tab=Templates");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Start from a proven structure." })).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a template" }).fill("qa-no-template-matches-this");
  await expect(main.getByText("No templates match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a template" })).toHaveValue("");
});

test("Unknown form URLs never display another form's builder", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  await page.goto(`/o/northline/forms/forms/missing-form-${Date.now()}`);
  const main = page.locator("#main");
  await expect(main).toContainText("No form in this workspace");
  await expect(page.getByLabel("Form editor overview")).toHaveCount(0);
});

test("Form editor exposes question status and workflow navigation", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const id = await page.evaluate(async () => {
    const repo = await import(/* @vite-ignore */ "/src/platform/repo.ts") as typeof import("../src/platform/repo");
    const context = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "forms", currency: "GBP",
      title: "QA Forms Editor Overview", status: "draft", fields: {},
    }, context);
    await repo.putRecord(record, context);
    return record.id;
  });
  await page.goto(`/o/northline/forms/forms/${id}`);
  await expect(page.getByLabel("Form editor overview")).toBeVisible();
  await expect(page.getByLabel("Form editor health")).toBeVisible();
  await page.getByLabel("Form editor overview").getByRole("button", { name: "Logic" }).click();
  await expect(page).toHaveURL(new RegExp(`/forms/forms/${id}/logic`));
  await expect(page.getByLabel("Conditional logic overview")).toBeVisible();
});
