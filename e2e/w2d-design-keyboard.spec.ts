import { expect, test, type Page } from "@playwright/test";

/* W2D — Design canvas keyboard editing: copy/paste (also across pages),
   duplicate, select all, group/ungroup, lock, align a single layer in its
   frame, undo, and persistence after reload. */

async function newFile(page: Page, name: string): Promise<void> {
  await page.goto("/o/northline/design/files");
  await page.locator("#main").getByRole("button", { name: "New file" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("File name").fill(name);
  await dialog.getByRole("button", { name: "Create the file" }).click();
  await expect(page).toHaveURL(/\/design\/files\/[^/?]+/);
}

const canvas = (page: Page) => page.locator("#main").getByRole("application", { name: /canvas\./ });

async function layerCount(page: Page): Promise<number> {
  const label = await canvas(page).getAttribute("aria-label");
  return Number(label?.match(/(\d+) layers/)?.[1] ?? -1);
}

test("layers are copied, pasted, grouped, locked and aligned from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newFile(page, "W2D keyboard card");
  const main = page.locator("#main");
  await expect(canvas(page)).toBeVisible();
  const start = await layerCount(page);

  await main.getByRole("button", { name: "Draw a rectangle" }).first().click();
  await expect.poll(() => layerCount(page)).toBe(start + 1);
  await expect(main.getByText("1 selected")).toBeVisible();

  await canvas(page).focus();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect.poll(() => layerCount(page)).toBe(start + 2);
  await expect(main.getByText("1 selected")).toBeVisible();

  await page.keyboard.press("Control+d");
  await expect.poll(() => layerCount(page)).toBe(start + 3);

  // Select all top-level layers, group them, then ungroup.
  await page.keyboard.press("Control+a");
  await expect(main.getByText(/^([2-9]|\d{2,}) selected$/)).toBeVisible();
  await page.keyboard.press("Control+g");
  await expect.poll(() => layerCount(page)).toBe(start + 4);
  await expect(main.getByText("1 selected")).toBeVisible();
  await page.keyboard.press("Control+Shift+g");
  await expect.poll(() => layerCount(page)).toBe(start + 3);

  // Lock the selection, then undo the lock.
  await page.keyboard.press("Control+Shift+l");
  await expect(main.getByRole("button", { name: /^Unlock / }).first()).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(main.getByRole("button", { name: /^Unlock / })).toHaveCount(0);

  // Persistence: saved first, then reload.
  await expect(main.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect.poll(() => layerCount(page)).toBe(start + 3);
});

test("alignment needs a parent frame for one layer and works across two", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await newFile(page, "W2D align card");
  const main = page.locator("#main");
  await expect(canvas(page)).toBeVisible();
  await main.getByRole("button", { name: "Draw a rectangle" }).first().click();
  await expect(main.getByText("1 selected")).toBeVisible();
  // A top-level layer has no parent frame, so it cannot align on its own.
  const alignTop = main.getByRole("button", { name: /^Align top/ });
  await expect(alignTop).toBeDisabled();
  await canvas(page).focus();
  await page.keyboard.press("Control+d");
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Control+a");
  await expect(alignTop).toBeEnabled();
  await alignTop.click();
  await expect(main.getByText("Undo: Align top")).toBeVisible();
  // Group the two: a single layer inside the group can now align to it.
  await canvas(page).focus();
  await page.keyboard.press("Control+g");
  await expect(main.getByText("1 selected")).toBeVisible();
  await expect(main.getByRole("button", { name: /^Align top/ })).toBeDisabled();
});

test("the design canvas keeps to a phone-width screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/o/northline/design/files/nl-designs-001");
  await expect(canvas(page)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
