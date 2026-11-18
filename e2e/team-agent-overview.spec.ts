import { expect, test } from "@playwright/test";

const AGENT = "/o/northline/team/agents/nl-agents-061";

test("AI employee overview uses real contract data and separates active from executable", async ({ page }) => {
  await page.goto(AGENT);
  const profile = page.getByRole("region", { name: "AI employee profile: Tomas Reiner" });
  await expect(profile).toBeVisible();
  await expect(profile.getByRole("heading", { name: "Tomas Reiner" })).toBeVisible();
  await expect(profile.getByText("Prepares purchase orders and supplier comparisons from recorded terms.")).toBeVisible();
  await expect(profile.getByText("Contract active")).toBeVisible();

  const limits = profile.getByRole("region", { name: "Operating limits" });
  await expect(limits.getByText("Spend ceiling")).toBeVisible();
  await expect(limits.getByText("Permitted actions")).toBeVisible();
  await expect(limits.getByText("Autonomy")).toBeVisible();
  await expect(limits.getByText("Tools granted")).toBeVisible();
  const reporting = profile.getByRole("region", { name: "Reporting and teams" });
  await expect(reporting.getByText("Reports to")).toBeVisible();
  await expect(reporting.getByText("Department")).toBeVisible();
  await expect(reporting.getByText("Agent teams")).toBeVisible();
  await expect(profile.getByText("Not connected")).toBeVisible();
  await expect(profile.getByText(/no model provider is connected to run work/i)).toBeVisible();
});

test("AI profile labels are readable on the dark machine stage", async ({ page }) => {
  await page.goto(AGENT);
  const profile = page.getByRole("region", { name: "AI employee profile: Tomas Reiner" });
  await expect(profile).toHaveAttribute("data-machine", "true");
  const result = await profile.evaluate(el => {
    function luminance(rgb: string) {
      const match = rgb.match(/\d+(?:\.\d+)?/g);
      if (!match) return 0;
      const channels = match.slice(0, 3).map(n => {
        const c = Number(n) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    }
    const label = el.querySelector(".team-agent-overview__metric dt")!;
    const labelColor = getComputedStyle(label).color;
    const stage = getComputedStyle(el).backgroundColor;
    const light = Math.max(luminance(labelColor), luminance(stage));
    const dark = Math.min(luminance(labelColor), luminance(stage));
    return { labelColor, contrast: (light + 0.05) / (dark + 0.05) };
  });
  expect(result.contrast, `Label must meet WCAG AA on dark card; got ${result.labelColor}`).toBeGreaterThanOrEqual(4.5);
});

for (const width of [390, 768, 1440]) {
  test(`AI overview lays out without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(AGENT);
    const profile = page.getByRole("region", { name: "AI employee profile: Tomas Reiner" });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole("region", { name: "Reporting and teams" })).toBeVisible();
    const cardBox = await profile.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.x).toBeGreaterThanOrEqual(0);
    expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(width + 1);
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
