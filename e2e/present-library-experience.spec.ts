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
