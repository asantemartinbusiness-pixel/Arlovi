import { expect, test } from "@playwright/test";

test.describe("Ask Arlovi workspace assistant", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/o/northline/workspace/home");
    await page.getByRole("button", { name: "Ask Arlovi" }).click();
  });

  test("explains local scope and offers useful prompts", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Ask Arlovi" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Using local workspace records")).toBeVisible();
    await expect(dialog.getByText("No language model is connected", { exact: false })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "How can I help?" })).toBeVisible();
    for (const label of ["Priorities", "Finance", "Missions", "Commitments"]) {
      await expect(dialog.getByRole("button", { name: new RegExp(label) })).toBeVisible();
    }
    await expect(dialog.getByLabel("Ask about Northline Atelier")).toBeVisible();
  });

  test("suggestion generates a local answer and new conversation resets the panel", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Ask Arlovi" });
    await dialog.getByRole("button", { name: /Priorities/ }).click();
    await expect(dialog.getByRole("log", { name: "Conversation" })).toBeVisible();
    await expect(dialog.getByText("What needs attention today?")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "How can I help?" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "New conversation" }).click();
    await expect(dialog.getByRole("heading", { name: "How can I help?" })).toBeVisible();
    await expect(dialog.getByRole("log", { name: "Conversation" })).toHaveCount(0);
  });

  test("Enter sends, Shift+Enter adds a line, and empty submissions are disabled", async ({ page }) => {
    const dialog = page.getByRole("dialog", { name: "Ask Arlovi" });
    const composer = dialog.getByRole("textbox", { name: "Ask about Northline Atelier" });
    const send = dialog.getByRole("button", { name: "Send question" });
    await expect(send).toBeDisabled();
    await composer.fill("What needs attention");
    await composer.press("Shift+Enter");
    await composer.type("today?");
    await expect(composer).toHaveValue("What needs attention\ntoday?");
    await composer.press("Enter");
    await expect(dialog.getByRole("log", { name: "Conversation" })).toContainText("What needs attention");
    await expect(composer).toHaveValue("");
    await expect(send).toBeDisabled();
  });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`Ask Arlovi stays usable at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/o/northline/workspace/home");
    await page.getByRole("button", { name: "Ask Arlovi" }).click();
    const dialog = page.getByRole("dialog", { name: "Ask Arlovi" });
    await expect(dialog.getByRole("heading", { name: "How can I help?" })).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Ask about Northline Atelier" })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /Finance/ })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    expect(overflow, "Assistant should not cause horizontal document overflow").toBe(false);
  });
}
