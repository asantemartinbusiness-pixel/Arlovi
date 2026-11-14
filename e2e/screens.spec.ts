import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const catalog = JSON.parse(readFileSync(new URL("../src/generated/catalog.json", import.meta.url), "utf8")) as {
  screens: { title: string; route: string; tabs: string[]; actions: string[]; sampleId: string }[];
};

test("executive home and a posted journal survive reload", async ({ page }) => {
  await page.goto("/o/northline/hq/home");
  await expect(page.getByRole("heading", { level: 1, name: "Executive Home" })).toBeVisible();
  await page.getByRole("tab", { name: "Week" }).click();
  await expect(page.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Widget picker" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/o/northline/fin/ledger");
  await page.getByRole("row", { name: /Wage accrual draft/ }).click();
  await page.getByRole("button", { name: "Post approved journal" }).click();
  await expect(page.getByRole("button", { name: /Journal posted/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row", { name: /Wage accrual draft/ })).toContainText("posted");
});

test("storefront hold and booking conflict stay honest", async ({ page }) => {
  await page.goto("/o/northline/commerce/storefront");
  await page.getByRole("button", { name: "Add to cart" }).first().click();
  await page.getByRole("button", { name: "Hold order" }).click();
  await expect(page.getByText("Card capture is not connected")).toBeVisible();

  await page.goto("/o/northline/book/public/showroom-consult");
  await expect(page.getByRole("button", { name: /held|available/ }).first()).toBeVisible();
});

test("every registered screen renders its title and tabs", async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const screen of catalog.screens) {
    const path = screen.route.replace(":org", "northline").replace(":id", screen.sampleId).replace(":slug", "showroom-consult");
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: screen.title, exact: true })).toBeVisible();
    await expect(page.getByRole("tab", { name: screen.tabs[0], exact: true })).toBeVisible();
    await expect(page.locator("#main").getByRole("button", { name: screen.actions[0], exact: true }).first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});
