import { expect, test, type Page } from "@playwright/test";

/*
 * WS1 — the asset library as a working tool: folders, multi-file upload held in
 * this browser, tags, search, metadata editing, linking to a project, and the
 * same library on a phone. Every step is checked again after a reload.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const ORG = "/o/northline";
const go = async (page: Page, path: string) => {
  await page.goto(`${ORG}${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);
  await expect(page.locator("h1").first()).toBeVisible();
};

// A 1×1 PNG, so the import reads real pixels and real dimensions.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const NOTES = Buffer.from("Press notes for the winter launch.\nEmbargo until Monday.", "utf8");
const folder = (page: Page, name: string) => page.locator("#main .asset-rail-item").filter({ hasText: name });

test("asset library: folder, upload, tag, search, edit, link — all survive a reload", async ({ page }) => {
  await go(page, "/asset/assets");
  const main = page.locator("#main");
  const dialog = page.getByRole("dialog");
  await expect(main.getByRole("navigation", { name: "Folders" })).toBeVisible();
  await expect(folder(page, "Brand marks")).toBeVisible();

  // A new folder opens straight away.
  await main.getByRole("button", { name: "New folder" }).click();
  await dialog.getByLabel("Folder name").fill("Press kit");
  await dialog.getByRole("button", { name: "Create folder" }).click();
  await expect(page).toHaveURL(/folder=/);
  await expect(main.getByRole("heading", { name: "Press kit" })).toBeVisible();

  // Two files at once into that folder, tagged on the way in.
  await main.getByRole("button", { name: /Upload here/ }).click();
  await expect(dialog.getByLabel("Folder")).toHaveValue(/assetFolders|^[a-z0-9-]+$/);
  await dialog.locator('input[type="file"]').setInputFiles([
    { name: "winter-swatch.png", mimeType: "image/png", buffer: PNG },
    { name: "press-notes.txt", mimeType: "text/plain", buffer: NOTES },
  ]);
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByText(/1 × 1/)).toBeVisible();
  await dialog.getByLabel("Tags", { exact: true }).fill("Press, Winter 2026");
  await dialog.getByRole("button", { name: "Add 2 files to the library" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(main.getByRole("listitem").filter({ hasText: "Winter swatch" })).toBeVisible();
  await expect(main.getByRole("listitem").filter({ hasText: "Press notes" })).toBeVisible();

  // Reload: the folder, its two files and their tags are still there.
  await page.reload();
  await expect(main.getByRole("heading", { name: "Press kit" })).toBeVisible();
  await expect(folder(page, "Press kit")).toContainText("2");
  await expect(main.getByRole("button", { name: /winter-2026\s*2/ })).toBeVisible();

  // Search across the whole library finds the file by its original name.
  await folder(page, "All assets").click();
  await main.getByLabel("Search the library").fill("press-notes");
  await expect(main.locator(".asset-tile")).toHaveCount(1);
  await main.getByLabel("Search the library").fill("");
  await main.getByRole("button", { name: /^press\s*2$/ }).click();
  await expect(main.locator(".asset-tile")).toHaveCount(2);
  await main.getByRole("button", { name: "Clear filters" }).first().click();

  // Open the text file: its contents are shown, not a placeholder.
  await main.getByRole("button", { name: "Press notes", exact: true }).click();
  await expect(page).toHaveURL(/\/asset\/assets\/[^/?]+/);
  await expect(main.getByLabel(/Press notes — text/)).toContainText("Embargo until Monday.");

  // Edit the metadata and approve it.
  await main.getByRole("button", { name: "Edit details" }).first().click();
  await dialog.getByLabel("Name").fill("Winter press notes");
  await dialog.getByLabel("Alternative text").fill("Embargoed press notes");
  await dialog.getByLabel("Review").selectOption("approved");
  await dialog.getByRole("button", { name: "Save details" }).click();
  await expect(dialog).toHaveCount(0);

  // Link it to a real project, then follow the link.
  await main.getByRole("button", { name: "Link to a record" }).first().click();
  await dialog.getByLabel("Find a record").fill("Winter trade");
  await dialog.getByRole("button", { name: "Link Winter trade story" }).click();
  await expect(dialog.getByRole("button", { name: "Unlink Winter trade story" })).toBeVisible();
  await dialog.getByRole("button", { name: "Done" }).click();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Winter press notes" }).first()).toBeVisible();
  await expect(main.getByText("Embargoed press notes").first()).toBeVisible();
  await expect(main.getByText("approved", { exact: true }).first()).toBeVisible();
  const linked = main.locator(".asset-linkrow").filter({ hasText: "Winter trade story" }).first();
  await expect(linked).toBeVisible();
  await linked.getByRole("button", { name: "Open" }).click();
  await expect(page).toHaveURL(/\/present\/decks\/nl-decks-001/);
});

test("asset library: bulk move and tag from the grid", async ({ page }) => {
  await go(page, "/asset/assets?folder=nl-assetFolders-002");
  const main = page.locator("#main");
  const dialog = page.getByRole("dialog");
  await expect(main.getByRole("heading", { name: "Product photography" })).toBeVisible();
  await main.getByLabel("Select Ravelin pendant — detail").check();
  await main.getByLabel("Select Ravelin hero — 800×800 catalogue").check();
  await expect(main.getByText("2 selected")).toBeVisible();
  await main.getByRole("button", { name: "Move or tag" }).click();
  await dialog.getByLabel("Folder").selectOption({ label: "Campaign archive" });
  await dialog.getByLabel("Add tags").fill("spring-reuse");
  await dialog.getByRole("button", { name: "Apply to 2" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(main.locator(".asset-tile")).toHaveCount(4);

  await page.reload();
  await folder(page, "Campaign archive").click();
  await expect(main.locator(".asset-tile")).toHaveCount(3);
  await expect(main.getByRole("button", { name: /spring-reuse\s*2/ })).toBeVisible();
});

test("asset library works on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await go(page, "/asset/assets");
  const main = page.locator("#main");
  await expect(main.getByRole("navigation", { name: "Folders" })).toBeVisible();
  await folder(page, "Sites and process").click();
  await expect(main.locator(".asset-tile")).toHaveCount(5);
  await main.getByRole("group", { name: "Layout" }).getByRole("button", { name: "List" }).click();
  await expect(main.getByRole("table").or(main.locator(".ds-card-list")).first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.reload();
  // The layout choice is a per-device preference and the folder is in the address.
  await expect(main.getByRole("heading", { name: "Sites and process" })).toBeVisible();
  await expect(main.getByRole("group", { name: "Layout" }).getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
});
