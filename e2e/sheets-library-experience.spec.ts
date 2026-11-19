import { expect, test } from "@playwright/test";

test("Sheets library presents workbook context and useful filtering", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const main = page.locator("#main");
  await expect(main.getByLabel("Workbook library overview")).toBeVisible();
  await main.getByRole("searchbox", { name: "Search" }).fill("sheets-qa-no-match-9283");
  await expect(main).toContainText("No workbooks match your filters");
  await main.getByRole("button", { name: "Reset filters" }).click();
  await expect(main.getByRole("searchbox", { name: "Search" })).toHaveValue("");
});

test("Sheets shared tab shows records of collaboration without promising external access", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks?tab=Shared");
  const main = page.locator("#main");
  await expect(main).toContainText("This is not an external permission or invitation.");
});

test("Formula audit shows calculated workbook health and a return route to the grid", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const workbook = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "QA Sheets Calculation Context", status: "active", fields: { folder: "Operations" },
    }, ctx);
    await repo.putRecord(workbook, ctx);
    return workbook.id;
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}/formulas?tab=Errors`);
  const main = page.locator("#main");
  await expect(main.getByLabel("Calculation overview")).toBeVisible();
  await main.getByRole("button", { name: "Back to grid" }).click();
  await expect(page).toHaveURL(new RegExp(`/sheets/workbooks/${id}(?:\\?|$)`));
});

test("Structured data table overview shows actual workbook definitions", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "QA Structured Table Screen", status: "active", fields: { folder: "Operations" },
    }, { actor: "Maya Chen", now: new Date().toISOString() });
    await repo.putRecord(record, { actor: "Maya Chen", now: new Date().toISOString() });
    return record.id;
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}/tables?tab=Tables`);
  await expect(page.locator("#main").getByLabel("Structured data overview")).toBeVisible();
});

test("Chart dashboard and export views expose the data source and calculation status", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "QA Chart and Export Context", status: "active", fields: { folder: "Operations" },
    }, { actor: "Maya Chen", now: new Date().toISOString() });
    await repo.putRecord(record, { actor: "Maya Chen", now: new Date().toISOString() });
    return record.id;
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}/charts?tab=Dashboard`);
  await expect(page.locator("#main").getByLabel("Chart dashboard overview")).toBeVisible();
  await page.goto(`/o/northline/sheets/workbooks/${id}/io?tab=Exports`);
  await expect(page.locator("#main").getByLabel("Export overview")).toBeVisible();
});

test("Workbook collaboration exposes review context and keeps local sharing explicit", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "QA Workbook Sharing Scope", status: "active", fields: { folder: "Operations" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}/collab?tab=Permissions`);
  const main = page.locator("#main");
  await expect(main.getByLabel("Workbook collaboration overview")).toBeVisible();
  await main.getByRole("button", { name: "Sharing list" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("QA Workbook Sharing Scope");
  await expect(dialog).toContainText("no invitations are sent");
});

test("CSV import requires acknowledgment before replacing an existing worksheet", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "QA CSV Import Guard", status: "active", fields: { folder: "Operations" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}/io?tab=Imports`);
  await page.locator("#main").getByRole("button", { name: "Choose a file" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Paste CSV, or choose a file" }).fill("Name,Value\nTest,100");
  await dialog.getByLabel("Where").selectOption("current");
  await expect(dialog).toContainText("This replaces the active sheet's cell contents");
  await expect(dialog.getByRole("checkbox", { name: /I understand that/ })).not.toBeChecked();
});

test("Publishing explains local-only status and requires confirmation", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: "QA Workbook Publication", status: "active", fields: { folder: "Operations" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/sheets/workbooks/${id}/io?tab=Exports`);
  await page.locator("#main").getByRole("button", { name: "Publish workbook" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Status only, not access enforcement");
  await expect(dialog.getByRole("checkbox", { name: /records status without granting external access/ })).not.toBeChecked();
});

test("Archived workbooks remain discoverable through the library status filter", async ({ page }) => {
  await page.goto("/o/northline/sheets/workbooks");
  const title = "QA Archived Workbook Finder";
  await page.evaluate(async (name) => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "workbooks", currency: "GBP",
      title: name, status: "archived", fields: { folder: "Archive" },
    }, ctx);
    await repo.putRecord(record, ctx);
  }, title);
  await page.reload();
  const main = page.locator("#main");
  await main.getByLabel("Workbook status").selectOption("archived");
  await main.getByRole("searchbox", { name: "Search" }).fill(title);
  await expect(main.getByRole("table").getByText(title).first()).toBeVisible();
});
