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
  await expect(main).toContainText("These records do not grant public or workspace access.");
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

test("Animation and audience screens expose visible workflow status", async ({ page }) => {
  await page.goto("/o/northline/present/decks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "decks", currency: "GBP",
      title: "QA Presenter Motion Context", status: "active", fields: { folder: "Marketing" },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/present/decks/${id}/animation?tab=Slides`);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Motion with purpose." })).toBeVisible();
  await expect(main.getByLabel("Animation workflow overview")).toBeVisible();
  await page.goto(`/o/northline/present/decks/${id}/present?tab=Audience`);
  await expect(main.getByRole("heading", { name: "What your audience will see." })).toBeVisible();
  await expect(main.getByLabel("Audience session overview")).toBeVisible();
});

test("Present review export states source output limitations clearly", async ({ page }) => {
  await page.goto("/o/northline/present/decks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "decks", currency: "GBP",
      title: "QA Deck Export Context", status: "active", fields: {},
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/present/decks/${id}/review?tab=Export`);
  const main = page.locator("#main");
  await expect(main.getByRole("heading", { name: "Ready for the room." })).toBeVisible();
  await expect(main.getByLabel("Presentation review overview")).toBeVisible();
  await expect(main).toContainText("PPTX is not produced here");
});

test("Present publishing keeps local status separate from public access", async ({ page }) => {
  await page.goto("/o/northline/present/decks");
  const id = await page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "decks", currency: "GBP",
      title: "QA Local Publishing Disclosure", status: "draft", fields: {},
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/present/decks/${id}/review?tab=Publish`);
  const main = page.locator("#main");
  await expect(main.getByText("Publication status is not a shared website")).toBeVisible();
  await expect(main.getByRole("button", { name: "Mark as published locally" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Record sharing intent" })).toBeVisible();
});

test("An unknown presentation URL never opens a different deck", async ({ page }) => {
  await page.goto("/o/northline/present/decks");
  const id = "missing-deck-" + Date.now();
  await page.goto(`/o/northline/present/decks/${id}`);
  await expect(page.locator("#main")).toContainText("No deck is open");
  await expect(page.locator("#main").getByLabel("Active slide context")).toHaveCount(0);
});
