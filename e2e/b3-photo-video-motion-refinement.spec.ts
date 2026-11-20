import { expect, test } from "@playwright/test";

/* B3 — photo, video and motion refinement. Three promises:
   PHOTO batch: a name that is already taken is a previewed, explicit decision, never an overwrite.
   VIDEO: exporting is a stated, confirmed local render; the command bar does not start one by itself.
   MOTION: the keyframe inspector follows the selected keyframe and leads the panel. */

const CLOCK = "clock=2026-11-14T09:30:00Z";

test("photo batch previews colliding output names and keeps both files by default", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/o/northline/photo/batch?${CLOCK}`);
  const main = page.locator("#main");
  await main.getByRole("tab", { name: "Presets" }).click();
  await main.getByLabel("File name").fill("image-{w}");
  await main.getByLabel("Longest edge").fill("600");
  await main.getByRole("tab", { name: "Queue" }).click();
  await main.getByRole("button", { name: "Select every readable image" }).click();
  await main.getByRole("tabpanel", { name: "Queue" }).getByRole("button", { name: "Build the batch" }).click();

  /* The queue itself already names the clash. */
  await expect(main.getByRole("list", { name: "Planned output files" })).toContainText("image-600-2.jpg");
  await expect(main.getByText("name taken").first()).toBeVisible();

  /* Running asks first, with the names and the choice. */
  await main.getByRole("button", { name: /Review names, then run 3/ }).click();
  const dialog = page.getByRole("dialog", { name: "Before the files are written" });
  await expect(dialog).toContainText("cannot replace a file on your disk");
  await expect(dialog.getByRole("list", { name: "Output names" })).toContainText("image-600.jpg → image-600-2.jpg");
  await expect(dialog.getByRole("button", { name: "Write 3 files" })).toBeVisible();

  /* Choosing to skip duplicates changes what will be written, before anything is. */
  await dialog.getByLabel("Where a name is taken").selectOption("skip");
  await expect(dialog.getByRole("button", { name: "Write 1 file" })).toBeVisible();
  await dialog.getByRole("button", { name: "Write 1 file" }).click();
  await main.getByRole("tab", { name: "Results" }).click();
  await expect(main.getByText(/skipped as chosen/).first()).toBeVisible({ timeout: 40_000 });
  await expect(main.getByText("image-600.jpg").first()).toBeVisible();
  await expect(main.getByText("image-600-2.jpg")).toHaveCount(0);
});

test("video export asks, and says what is rendered locally, before it renders", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/o/northline/video/projects/nl-videos-001/export?${CLOCK}`);
  await page.getByRole("button", { name: "Export to WebM" }).click();
  const dialog = page.getByRole("dialog", { name: "Render" });
  await expect(dialog).toContainText("This machine draws all");
  await expect(dialog).toContainText("Nothing is uploaded");
  /* Nothing has started: no progress meter, and cancelling leaves no render behind. */
  await expect(page.getByText("Render progress")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Render progress")).toHaveCount(0);
});

test("motion keyframe inspector leads the panel once a keyframe is selected", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/o/northline/motion/projects/nl-motions-001?${CLOCK}`);
  const main = page.locator("#main");
  const panel = main.getByRole("complementary", { name: "Properties and keyframes" });
  await expect(panel.getByText("Select a keyframe on the timeline")).toBeVisible();
  await main.getByRole("button", { name: /keyframe at/ }).first().click();
  await expect(panel.getByText(/^Keyframe · /)).toBeVisible();
  const heading = await panel.getByText(/^Keyframe · /).boundingBox();
  const transform = await panel.getByText(/transform$/i).boundingBox();
  expect(heading!.y).toBeLessThan(transform!.y);
  await expect(panel.getByLabel("Easing out of this keyframe")).toBeVisible();
});

test("photo batch: one image can be picked on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/o/northline/photo/batch?${CLOCK}`);
  const main = page.locator("#main");
  await main.getByRole("button", { name: /^Arc Lamp study/ }).first().click();
  await expect(main.getByText("1 of 4 selected")).toBeVisible();
  await expect(main.locator(".ds-pill", { hasText: "In the batch" }).first()).toBeVisible();
  await main.getByRole("tabpanel", { name: "Queue" }).getByRole("button", { name: "Build the batch" }).click();
  await expect(main.getByRole("list", { name: "Planned output files" }).getByRole("listitem")).toHaveCount(1);
});

test("easing: Edit easing enables as soon as a segment is chosen", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/o/northline/motion/projects/nl-motions-001/easing?${CLOCK}`);
  await expect(page.getByRole("button", { name: "Edit easing" })).toBeDisabled();
  await page.locator("button.mo-layer").first().click();
  await expect(page.getByRole("button", { name: "Edit easing" })).toBeEnabled();
});
