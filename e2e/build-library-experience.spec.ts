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
  await expect(page.locator("#main")).toContainText("Record not found");
  await expect(page.locator("#main")).toContainText("No other record was substituted.");
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
  await main.getByRole("button", { name: "New screen", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Design", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(main.getByRole("combobox", { name: "Screen being designed" }).locator("option:checked")).toHaveText("Screen 1");
  await expect(main.getByText("/screen-1", { exact: true })).toBeVisible();
});

test("Build code, checks and releases expose their real readiness boundaries", async ({ page }) => {
  await page.goto("/o/northline/build/projects");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "appProjects",
      currency: "GBP", title: "QA Build Readiness", status: "draft", fields: {},
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });

  await page.goto(`/o/northline/build/projects/${id}/code`);
  const main = page.locator("#main");
  await expect(main.getByLabel("Build generated code overview")).toBeVisible();
  await expect(main.getByLabel("Generated code status")).toBeVisible();

  await page.goto(`/o/northline/build/projects/${id}/tests`);
  await expect(main.getByLabel("Build checks overview")).toBeVisible();
  await expect(main.getByLabel("Model check summary")).toBeVisible();

  await page.goto(`/o/northline/build/projects/${id}/deploy`);
  await expect(main.getByLabel("Build release overview")).toBeVisible();
  await expect(main.getByLabel("Build release status")).toBeVisible();
  await expect(main.getByLabel("Build release status")).toContainText("Connected runtimes");
});

test("Build API, access, integration and monitoring pages provide scoped status", async ({ page }) => {
  await page.goto("/o/northline/build/projects");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "appProjects", currency: "GBP",
      title: "QA Build Capability Views", status: "draft", fields: {},
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  const main = page.locator("#main");
  await page.goto(`/o/northline/build/projects/${id}/api`);
  await expect(main.getByLabel("API contract overview", { exact: true })).toBeVisible();
  await expect(main.getByLabel("API contract overview metrics")).toContainText("Open contracts");
  await page.goto(`/o/northline/build/projects/${id}/auth?tab=Roles`);
  await expect(main.getByLabel("Access policy overview", { exact: true })).toBeVisible();
  await expect(main.getByLabel("Access policy overview metrics")).toContainText("Write grants");
  await page.goto(`/o/northline/build/projects/${id}/integrations`);
  await expect(main.getByLabel("Build integration overview")).toBeVisible();
  await expect(main.getByLabel("Integration connection summary")).toContainText("Connected providers");
  await page.goto(`/o/northline/build/projects/${id}/monitor`);
  await expect(main.getByLabel("Build monitoring overview")).toBeVisible();
  await expect(main.getByLabel("Monitoring diagnostic summary")).toContainText("Connected runtimes");
});

test("Rollback states its impact on the model, needs confirmation, and restores the earlier revision", async ({ page }) => {
  await page.goto("/o/northline/build/projects");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const first = { entities: [{ id: "e1", name: "Order", collection: "", fields: [] }], screens: [] };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "appProjects", currency: "GBP",
      title: "QA Rollback Impact", status: "draft", fields: {}, body: first,
    } as Parameters<typeof repo.newRecord>[0], ctx);
    await repo.putRecord(record, ctx);
    await repo.patchRecord(record.id, {
      body: {
        ...first,
        entities: [...first.entities, { id: "e2", name: "Invoice", collection: "", fields: [] }],
        releases: [{ id: "r1", environment: "staging", at: ctx.now, state: "blocked", note: "Stopped at the runtime boundary.", actor: "Maya Chen" }],
      },
    }, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/build/projects/${id}/deploy`);
  await page.getByRole("button", { name: "Roll back", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Roll back the model" })).toBeVisible();
  const impact = dialog.getByRole("table", { name: "Current model compared with the restored revision" });
  await expect(impact.getByRole("row", { name: /Entities 2 1 -1/ })).toBeVisible();
  await expect(dialog).toContainText("Invoice");
  await expect(dialog.getByText("Running app")).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Roll back the model" });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Replace the current model with this revision" }).check();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/o/northline/build/projects/${id}`);
  await expect(page.locator("#main").getByLabel("Project readiness summary")).toBeVisible();
  await page.goto(`/o/northline/build/projects/${id}/deploy?tab=Releases`);
  await expect(page.locator("#main")).toContainText(/rolled back/i);
});
