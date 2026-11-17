import { expect, test } from "@playwright/test";

test("Build project library has a responsive overview and recoverable search", async ({ page }) => {
  await page.goto("/o/northline/build/projects");
  const main = page.locator("#main");
  await expect(main.getByLabel("Build project overview")).toBeVisible();
  await expect(main.getByLabel("Build project activity")).toBeVisible();
  const input = main.getByRole("searchbox", { name: "Find a project" });
  await input.fill("no-build-project-matches-qa-2026");
  await expect(main.getByText("No projects match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
});

test("Build template search recovers from no results", async ({ page }) => {
  await page.goto("/o/northline/build/projects?tab=Templates");
  const main = page.locator("#main");
  await expect(main.getByLabel("Build project overview")).toBeVisible();
  const input = main.getByRole("searchbox", { name: "Find a template" });
  await input.fill("no-build-template-matches-qa-2026");
  await expect(main.getByText("No templates match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
});

test("An invalid Build project URL does not open a different project's overview", async ({ page }) => {
  await page.goto("/o/northline/build/projects");
  await page.goto("/o/northline/build/projects/missing-build-project-qa-2026");
  await expect(page.locator("#main")).toContainText("No app project in this workspace");
});

test("Build project overview and builder expose visible workflow context", async ({ page }) => {
  await page.goto("/o/northline/build/projects");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "appProjects",
      currency: "GBP", title: "QA Build Workflow", status: "draft", fields: {},
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/build/projects/${id}`);
  const main = page.locator("#main");
  await expect(main.getByLabel("Build project health overview")).toBeVisible();
  await main.getByLabel("Build project health overview").getByRole("button", { name: "Open builder" }).click();
  await expect(page).toHaveURL(new RegExp(`/build/projects/${id}/builder`));
  await expect(page.getByLabel("Build editor overview")).toBeVisible();
  await expect(page.getByLabel("Builder model status")).toBeVisible();
  await page.getByLabel("Build editor overview").getByRole("button", { name: "Data model" }).click();
  await expect(page.getByRole("tab", { name: "Data", exact: true })).toHaveAttribute("aria-selected", "true");
});
