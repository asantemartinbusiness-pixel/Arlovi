import { expect, test } from "@playwright/test";

/*
 * W2C — TEAM agent teams: create a team of AI employees with a lead, a purpose
 * and a shared approval policy; it shows on the directory, the organisation
 * chart and the lead's profile, survives reload, and can be archived.
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";

test("create, see everywhere, edit and archive an agent team", async ({ page }) => {
  await page.goto(`/o/northline/team/agents?${CLOCK}`);
  const section = page.getByRole("region", { name: "Agent teams" });
  await expect(section.getByRole("listitem", { name: "Supplier review desk" })).toBeVisible();
  await expect(section.getByText("The lead reviews, then a person approves")).toBeVisible();

  await section.getByRole("button", { name: "New agent team" }).click();
  const form = page.getByRole("form", { name: "New agent team" });
  await form.getByRole("button", { name: "Create team" }).click();
  await expect(form.getByText("Name the team.")).toBeVisible();
  await expect(form.getByText("Choose at least one AI employee.")).toBeVisible();

  await form.getByLabel("Team name").fill("Close crew");
  await form.getByLabel("Purpose").fill("Prepares month-end close drafts for Finance to review.");
  await form.getByRole("checkbox", { name: /^Idris Cole/ }).check();
  await form.getByRole("checkbox", { name: /^Nia Okonkwo/ }).check();
  await form.getByLabel("Lead").selectOption({ label: "Idris Cole" });
  await form.getByLabel("Approval policy").selectOption("person_each");
  await form.getByLabel("Approver").selectOption("Jonah Adeyemi");
  await form.getByRole("button", { name: "Create team" }).click();

  const team = section.getByRole("listitem", { name: "Close crew" });
  await expect(team).toBeVisible();
  await expect(team.getByText("A named person approves every output · approver Jonah Adeyemi")).toBeVisible();

  // Persisted.
  await page.reload();
  await expect(page.getByRole("region", { name: "Agent teams" }).getByRole("listitem", { name: "Close crew" })).toBeVisible();

  // On the organisation chart and on the lead's profile.
  await page.goto(`/o/northline/team/organization?${CLOCK}`);
  const org = page.getByRole("region", { name: "Agent teams on the organisation chart" });
  await expect(org.getByText("Close crew")).toBeVisible();
  await expect(org.getByText("led by Idris Cole")).toBeVisible();
  await page.goto(`/o/northline/team/agents/nl-agents-002?${CLOCK}`);
  await expect(page.getByText("Close crew (lead)")).toBeVisible();

  // Edit, then archive.
  await page.goto(`/o/northline/team/agents?${CLOCK}`);
  const again = page.getByRole("region", { name: "Agent teams" }).getByRole("listitem", { name: "Close crew" });
  await again.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("form", { name: "Edit agent team" });
  await expect(edit.getByLabel("Team name")).toHaveValue("Close crew");
  await edit.getByLabel("Purpose").fill("Prepares month-end close drafts and reconciliation notes.");
  await edit.getByRole("button", { name: "Save team" }).click();
  await expect(again.getByText("Prepares month-end close drafts and reconciliation notes.")).toBeVisible();
  await again.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("region", { name: "Agent teams" }).getByRole("listitem", { name: "Close crew" })).toHaveCount(0);
  await page.getByRole("region", { name: "Agent teams" }).getByRole("button", { name: "Show archived" }).click();
  await expect(page.getByRole("region", { name: "Agent teams" }).getByRole("listitem", { name: "Close crew" }).getByRole("button", { name: "Restore" })).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("agent teams fit a phone", async ({ page }) => {
    await page.goto(`/o/northline/team/agents?${CLOCK}`);
    await expect(page.getByRole("region", { name: "Agent teams" }).getByRole("listitem", { name: "Supplier review desk" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
