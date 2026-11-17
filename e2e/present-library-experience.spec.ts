import { expect, test } from "@playwright/test";

test("Present library displays search, deck counters and a recoverable empty state", async ({ page }) => {
  await page.goto("/o/northline/present/decks");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Presentations in progress." })).toBeVisible();
  await expect(main.getByLabel("Presentation library overview")).toBeVisible();
  await main.getByRole("searchbox", { name: "Find a presentation" }).fill("present-qa-no-matching-deck");
  await expect(main.getByText("No presentations match this view")).toBeVisible();
  await main.getByRole("button", { name: "Clear search" }).click();
  await expect(main.getByRole("searchbox", { name: "Find a presentation" })).toHaveValue("");
});

test("Present shared library never interprets another owner as external access", async ({ page }) => {
  await page.goto("/o/northline/present/decks?tab=Shared");
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Recorded sharing." })).toBeVisible();
  await expect(main).toContainText("Public or workspace access is not implied.");
});

test("Present slide editor exposes slide status and contextual theme navigation", async ({ page }) => {
  await page.goto("/o/northline/present/decks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "decks", currency: "GBP",
      title: "QA Present Slide Context", status: "active", fields: { folder: "Marketing" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/present/decks/${id}`);
  const main = page.locator("#main");
  await expect(main.getByLabel("Active slide context")).toBeVisible();
  await main.getByLabel("Active slide context").getByRole("button", { name: "Theme" }).click();
  await expect(page).toHaveURL(new RegExp(`/present/decks/${id}/theme`));
});
