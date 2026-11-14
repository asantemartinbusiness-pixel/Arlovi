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

test("an invoice can be created, edited, issued, and found in the ledger", async ({ page }) => {
  await page.goto("/o/northline/fin/invoices");
  await page.locator("#main").getByRole("button", { name: "Create", exact: true }).click();
  await expect(page).toHaveURL(/\/fin\/invoices\/.+/);
  await expect(page.getByRole("heading", { level: 1, name: "Invoice Detail" })).toBeVisible();
  const number = (await page.getByRole("heading", { level: 2 }).first().textContent())?.trim() ?? "";
  expect(number).toMatch(/^INV-/);
  await page.getByLabel("Description").fill("Studio day rate");
  await page.getByRole("button", { name: "Issue this invoice" }).click();
  await expect(page.getByText("awaiting_payment")).toBeVisible();
  await page.goto("/o/northline/fin/ledger");
  await expect(page.getByRole("row", { name: new RegExp(`Issue ${number}`) })).toBeVisible();
  await page.goto("/o/northline/fin/invoices?tab=Awaiting%20payment");
  await expect(page.getByRole("row", { name: new RegExp(number) })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("row", { name: new RegExp(number) })).toBeVisible();
});

test("a new design stays editable after reload", async ({ page }) => {
  await page.goto("/o/northline/design/files");
  await page.locator("#main").getByRole("button", { name: "New file", exact: true }).click();
  await expect(page).toHaveURL(/\/design\/files\/.+/);
  const layers = page.locator("#main .editor aside");
  const before = await layers.getByRole("button", { name: /^rect/ }).count();
  await page.locator("#main").getByRole("button", { name: "Add rectangle" }).click();
  await expect(layers.getByRole("button", { name: /^rect/ })).toHaveCount(before + 1);
  await page.getByRole("status").filter({ hasText: /Saved|layer/ }).first().waitFor({ state: "visible", timeout: 5000 }).catch(() => undefined);
  await page.reload();
  await expect(layers.getByRole("button", { name: /^rect/ })).toHaveCount(before + 1);
});

test("an AI employee appears in the directory and on the organization chart", async ({ page }) => {
  await page.goto("/o/northline/team/agents/new");
  await page.locator("#main").getByRole("button", { name: "Generate contract", exact: true }).click();
  await expect(page).toHaveURL(/\/team\/agents\/(?!new).+/);
  await expect(page.getByRole("heading", { level: 2, name: "New specialist" })).toBeVisible();
  await page.goto("/o/northline/team/agents");
  await expect(page.getByRole("row", { name: /New specialist/ })).toBeVisible();
  await page.goto("/o/northline/hq/organization?tab=AI%20employees");
  await expect(page.getByRole("button", { name: "New specialist" })).toBeVisible();
});

test("a deal drafts an invoice that opens in finance", async ({ page }) => {
  await page.goto("/o/northline/crm/deals/nl-deals-001");
  await page.getByRole("button", { name: "Draft invoice from this deal" }).click();
  await expect(page).toHaveURL(/\/fin\/invoices\/.+/);
  await expect(page.getByRole("heading", { level: 1, name: "Invoice Detail" })).toBeVisible();
  await expect(page.getByText(/draft · .+ · due/)).toBeVisible();
});

test("moving a task updates the project board after reload", async ({ page }) => {
  await page.goto("/o/northline/project/projects/nl-projects-001/board");
  await page.getByRole("button", { name: "Photograph Arc Lamp" }).click();
  await page.getByRole("region", { name: "doing" }).getByRole("button", { name: "Move here" }).click();
  await expect(page.getByRole("region", { name: "doing" }).getByRole("button", { name: "Photograph Arc Lamp" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "doing" }).getByRole("button", { name: "Photograph Arc Lamp" })).toBeVisible();
  await page.goto("/o/northline/project/projects/nl-projects-001");
  await expect(page.getByRole("listitem").filter({ hasText: "Photograph Arc Lamp" })).toContainText("doing");
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
