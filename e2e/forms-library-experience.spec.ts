import { expect, test } from "@playwright/test";

test("Forms library retains hierarchy and recovers from empty search", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const main = page.locator("#main");
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
  await expect(main.getByLabel("Forms library overview")).toBeVisible();
  await expect(main.getByRole("heading", { name: "Enquiry" })).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a template" }).fill("qa-no-template-matches-this");
  await expect(main.getByText("No templates match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a template" })).toHaveValue("");
});

test("Unknown form URLs never display another form's builder", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  await page.goto(`/o/northline/forms/forms/missing-form-${Date.now()}`);
  const main = page.locator("#main");
  // The shell record guard answers before the builder mounts (same as documents).
  await expect(main).toContainText("This record is unavailable");
  await expect(page.getByLabel("Form editor overview")).toHaveCount(0);
});

test("Form editor exposes question status and workflow navigation", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
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

test("Forms submission inbox displays status counts and a recoverable search", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({ organizationId: "org-northline", collection: "forms", currency: "GBP", title: "QA Response Inbox", status: "draft", fields: {} }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/forms/forms/${id}/submissions`);
  const main = page.locator("#main");
  await expect(main.getByLabel("Submission inbox overview")).toBeVisible();
  await expect(main.getByLabel("Submission workflow counts")).toBeVisible();
  await main.getByRole("searchbox", { name: "Search responses" }).fill("no-such-respondent-qa");
  await expect(main.getByText("No responses match this search")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Search responses" })).toHaveValue("");
});

test("Forms analytics and publishing keep measured context and local-only disclosure", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({ organizationId: "org-northline", collection: "forms", currency: "GBP", title: "QA Form Publishing", status: "draft", fields: {} }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/forms/forms/${id}/analytics`);
  await expect(page.locator("#main").getByLabel("Form analytics overview")).toBeVisible();
  await page.goto(`/o/northline/forms/forms/${id}/publish?tab=Access`);
  await expect(page.locator("#main").getByLabel("Form publishing overview")).toBeVisible();
  await expect(page.locator("#main")).toContainText("External hosting, public access controls and email delivery are not connected.");
});

test("Forms local publication requires acknowledgement and answerable questions", async ({ page }) => {
  await page.goto("/o/northline/forms/forms");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({ organizationId: "org-northline", collection: "forms", currency: "GBP", title: "QA Consent Guard", status: "draft", fields: {} }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/forms/forms/${id}`);
  await page.getByRole("button", { name: "Publish", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Publishing is blocked");
  await expect(dialog.getByRole("checkbox", { name: /I understand this records a local publication status/ })).not.toBeChecked();
  await expect(dialog.getByRole("button", { name: /Mark version .* live locally/ })).toBeDisabled();
});
