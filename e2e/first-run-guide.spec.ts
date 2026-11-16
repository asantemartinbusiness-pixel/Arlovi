import { expect, test } from "@playwright/test";

test("new company headquarters has an actionable, truthful and dismissible setup guide", async ({ page }) => {
  const slug = "new-team-" + Math.floor(Math.random() * 9000000 + 1000000);
  await page.goto("/setup");
  await page.getByRole("textbox", { name: "Company name" }).fill(slug);
  await page.getByRole("textbox", { name: "Your name" }).fill("Morgan Smith");
  for (let stage = 0; stage < 9; stage++) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Enter headquarters" }).click();
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/workspace/home"));

  const guide = page.getByRole("region", { name: "Your company getting started" });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { name: "Welcome to " + slug + "." })).toBeVisible();
  await expect(guide.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");
  await expect(guide).toContainText("Specialists start as drafts without model execution");

  await guide.getByRole("link", { name: /Open Brain/ }).click();
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/brain/"));
  await page.goto("/o/" + slug + "/workspace/home");
  await guide.getByRole("button", { name: "Dismiss getting-started guidance" }).click();
  await expect(guide).toHaveCount(0);
  await page.reload();
  await expect(guide).toHaveCount(0);
  await page.goto("/o/" + slug + "/workspace/home?gettingStarted=1");
  await expect(guide).toBeVisible();
  await guide.getByRole("button", { name: "Dismiss getting-started guidance" }).click();
  await expect(guide).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp("/o/" + slug + "/workspace/home$"));
});
