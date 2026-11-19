import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * W2B people, communications and administration depth: email drafts kept
 * locally and honestly unsent, calendar day/week/agenda with create, edit and
 * clash hints, meeting records with agenda, answers and actions linked to
 * records, the HR leaver checklist and the ADMIN privacy register. Every
 * change is checked again after a reload.
 *
 *   BASE_URL=http://127.0.0.1:5182 npx playwright test e2e/w2b-people-comms.spec.ts --workers=1
 */

const CLOCK = "clock=2026-11-14T09:30:00Z";
const ORG = "/o/northline";

async function open(page: Page, path: string, heading?: string | RegExp): Promise<void> {
  await page.goto(`${ORG}${path}${path.includes("?") ? "&" : "?"}${CLOCK}`);
  if (heading) await expect(page.getByRole("heading", { level: 1, name: heading }).first()).toBeVisible();
  else await expect(page.locator("h1").first()).toBeAttached();
}

async function reload(page: Page): Promise<void> {
  await page.reload();
  await expect(page.locator("h1").first()).toBeAttached();
}

const main = (page: Page): Locator => page.locator("#main");
const dialog = (page: Page): Locator => page.getByRole("dialog");

async function dismissToasts(page: Page): Promise<void> {
  const buttons = page.locator(".ds-toasts").getByRole("button", { name: "Dismiss" });
  for (let i = await buttons.count(); i > 0; i -= 1) await buttons.first().click().catch(() => undefined);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

test("COMMS email: a draft is kept as you type, never sent, and found by search", async ({ page }) => {
  await open(page, "/comms/email?tab=Drafts", "Email Inbox");
  // One statement on the page: no mail service, nothing delivered.
  await expect(page.getByText("No mail service is connected, so nothing is delivered.")).toBeVisible();
  await page.getByRole("button", { name: "Compose", exact: true }).click();

  const compose = dialog(page);
  await compose.getByRole("textbox", { name: "To" }).fill("not-an-address");
  await expect(compose.getByText("One of those is not an address")).toBeVisible();
  await expect(compose.getByText("Fix the addresses to save")).toBeVisible();
  await compose.getByRole("textbox", { name: "To" }).fill("orders@kilnworks.example");
  await compose.getByLabel("Subject").fill("Kiln shelf replacement");
  await compose.getByRole("textbox", { name: "Message" }).fill("Could you quote for six cordierite shelves?");
  // Autosave writes the draft without pressing anything.
  await expect(compose.getByText(/^Saved in this browser/)).toBeVisible();
  await expect(compose.getByText("Kept as a local draft")).toBeVisible();
  await compose.getByRole("button", { name: "Cancel" }).click();

  const row = main(page).getByRole("button", { name: /Kiln shelf replacement/ });
  await expect(row).toContainText("Not delivered");
  await reload(page);
  await expect(main(page).getByRole("button", { name: /Kiln shelf replacement/ })).toBeVisible();

  // Reopen the draft: the editor holds what was saved; an edit is kept.
  await main(page).getByRole("button", { name: /Kiln shelf replacement/ }).click();
  await expect(main(page).getByText("Local draft, not delivered")).toBeVisible();
  await main(page).getByRole("button", { name: "Open" }).click();
  await expect(dialog(page).getByLabel("Subject")).toHaveValue("Kiln shelf replacement");
  await dialog(page).getByLabel("Message").fill("Could you quote for eight cordierite shelves?");
  await dialog(page).getByRole("button", { name: "Save as a draft" }).click();
  await expect(dialog(page)).toHaveCount(0);

  // Search runs across every folder.
  await page.getByRole("tab", { name: "Inbox", exact: true }).click();
  await main(page).getByRole("searchbox", { name: "Search email conversations" }).fill("cordierite eight");
  await expect(main(page).getByText("1 conversation", { exact: true })).toBeVisible();
  await expect(main(page).getByRole("button", { name: /Kiln shelf replacement/ })).toBeVisible();
  await main(page).getByRole("searchbox", { name: "Search email conversations" }).fill("zz-nothing-here");
  await expect(main(page).getByText("No matching conversations")).toBeVisible();
});

test("COMMS calendar: create from a free hour with a clash hint, edit it, see it on the agenda", async ({ page }) => {
  await open(page, "/comms/calendar?tab=Day", "Calendar");
  await expect(main(page).getByText("Winter collection review")).toBeVisible();
  // 11:00 holds the seeded review, so the hour offers no "create" control; 12:00 is free.
  await expect(main(page).getByRole("button", { name: /Create an event on .* at 11:00/ })).toHaveCount(0);
  await main(page).getByRole("button", { name: /Create an event on .* at 12:00/ }).click();
  const form = dialog(page);
  await expect(form.getByLabel("Start")).toHaveValue("12:00");
  await form.getByLabel("Title").fill("Glaze sign-off");
  await form.getByLabel("Start").fill("11:30");
  await form.getByLabel("Attendees").selectOption(["Theo Marsh"]);
  await expect(form.getByText(/1 clash with this time/)).toBeVisible();
  await expect(form.getByText(/Winter collection review .*\(Maya Chen, Theo Marsh\)/)).toBeVisible();
  // Moving it out of the clash clears the hint.
  await form.getByLabel("Start").fill("12:00");
  await expect(form.getByText("No clash with anything recorded in this workspace for these people.")).toBeVisible();
  await form.getByLabel("Agenda").fill("Glaze decision — Maya Chen, 15\nShelf order, 10");
  await form.getByLabel("Linked record").selectOption({ label: "Theo Marsh" });
  await form.getByRole("button", { name: "Create event" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(main(page).getByRole("button", { name: /^Glaze sign-off/ })).toBeVisible();

  await dismissToasts(page);
  await main(page).getByRole("button", { name: "Edit Glaze sign-off" }).click();
  await expect(dialog(page).getByLabel("Title")).toHaveValue("Glaze sign-off");
  await dialog(page).getByLabel("Title").fill("Glaze and shelf sign-off");
  await dialog(page).getByRole("button", { name: "Save changes" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await reload(page);
  await expect(main(page).getByRole("button", { name: /^Glaze and shelf sign-off/ })).toBeVisible();
  await page.getByRole("tab", { name: "Agenda" }).click();
  await expect(main(page).getByRole("button", { name: /^Glaze and shelf sign-off/ })).toBeVisible();

  // The meeting record holds the agenda and the linked record.
  await main(page).getByRole("button", { name: /^Glaze and shelf sign-off/ }).click();
  await expect(page).toHaveURL(/\/comms\/meetings\//);
  await expect(main(page).getByRole("checkbox", { name: "Glaze decision" })).toBeVisible();
  await expect(main(page).getByText("25 of 30 minutes planned", { exact: false })).toBeVisible();
  await expect(main(page).getByRole("button", { name: "Open Theo Marsh" })).toBeVisible();
  await main(page).getByRole("checkbox", { name: "Glaze decision" }).click();
  await expect(main(page).getByRole("checkbox", { name: "Glaze decision" })).toBeChecked();
  await expect(main(page).getByText(/1 of 2 covered/)).toBeVisible();
  await reload(page);
  await expect(main(page).getByRole("checkbox", { name: "Glaze decision" })).toBeChecked();
});

test("COMMS meeting: answers are recorded by name, actions become tasks", async ({ page }) => {
  await open(page, "/comms/meetings/nl-meetings-021", "Meeting");
  await page.getByRole("tab", { name: "Participants" }).click();
  await expect(main(page).getByText("Answers are recorded, not received")).toBeVisible();
  await main(page).getByLabel("Answer for Theo Marsh").selectOption("accepted");
  await expect(main(page).getByText(/Answer recorded by Maya Chen/)).toBeVisible();
  await expect(main(page).getByText(/1 accepted · 0 tentative · 0 declined · 3 no answer recorded/)).toBeVisible();

  await page.getByRole("tab", { name: "Notes" }).click();
  await main(page).getByLabel("New action").fill("Order the second glaze batch");
  await main(page).getByLabel("Owner").selectOption("Theo Marsh");
  await main(page).getByRole("button", { name: "Record an action" }).click();
  await expect(main(page).getByRole("checkbox", { name: "Order the second glaze batch — Theo Marsh" })).toBeVisible();
  await main(page).getByRole("button", { name: "Make a task" }).click();
  await expect(main(page).getByRole("button", { name: "Open the task" })).toBeVisible();

  await reload(page);
  await expect(main(page).getByRole("checkbox", { name: "Order the second glaze batch — Theo Marsh" })).toBeVisible();
  await main(page).getByRole("button", { name: "Open the task" }).click();
  await expect(page).toHaveURL(/\/project\/tasks\//);
  await expect(main(page).getByText("Order the second glaze batch").first()).toBeVisible();

  await open(page, "/comms/meetings/nl-meetings-021?tab=Participants", "Meeting");
  await expect(main(page).getByLabel("Answer for Theo Marsh")).toHaveValue("accepted");
});

test("HR leaver checklist hands workspace access to ADMIN, which closes it by suspending", async ({ page }) => {
  await open(page, "/hr/employees/nl-employees-022?tab=Access", "Sable Nguyen");
  await expect(main(page).getByText("Sable Nguyen").first()).toBeVisible();
  await main(page).getByRole("button", { name: "Start offboarding" }).click();
  const modal = dialog(page);
  await expect(modal.getByLabel("Leaver checklist that will be created")).toContainText("Workspace access suspended in Administration");
  await modal.getByRole("textbox", { name: "Reason for offboarding" }).fill("Resigned to start her own studio; handover agreed.");
  const checks = modal.getByRole("checkbox");
  for (let i = 0; i < 3; i += 1) await checks.nth(i).check();
  await modal.getByRole("button", { name: "Record departure" }).click();
  await expect(dialog(page)).toHaveCount(0);

  const checklist = main(page).locator(".ds-card").filter({ hasText: "LEAVER CHECKLIST" });
  await expect(checklist.getByText("0 of 4 steps done")).toBeVisible();
  await expect(checklist.getByRole("checkbox", { name: "Workspace access suspended in Administration" })).toBeDisabled();
  await checklist.getByRole("checkbox", { name: "Equipment, keys and documents returned" }).click();
  await expect(checklist.getByText("1 of 4 steps done")).toBeVisible();
  await reload(page);
  await expect(main(page).getByRole("checkbox", { name: "Equipment, keys and documents returned" })).toBeChecked();

  await dismissToasts(page);
  await main(page).getByRole("button", { name: "Open Members in Administration" }).click();
  await expect(page).toHaveURL(/\/admin\/members/);
  const handoff = main(page).getByRole("group", { name: "Leaver Sable Nguyen" });
  await expect(handoff).toContainText("Member active");
  await handoff.getByRole("button", { name: "Review and suspend Sable Nguyen" }).click();
  await expect(dialog(page).getByText(/Closed on Sable Nguyen's record/)).toBeVisible();
  await dialog(page).getByLabel("Type OFFBOARD to confirm").fill("offboard");
  await dialog(page).getByRole("button", { name: "Suspend Sable Nguyen" }).click();
  await expect(page.getByText(/1 leaver step closed in People/)).toBeVisible();
  await expect(main(page).getByRole("group", { name: "Leaver Sable Nguyen" })).toHaveCount(0);

  await open(page, "/hr/employees/nl-employees-022?tab=Access", "Sable Nguyen");
  await expect(main(page).getByRole("checkbox", { name: "Workspace access suspended in Administration" })).toBeChecked();
  await expect(main(page).getByText("2 of 4 steps done")).toBeVisible();
});

test("ADMIN teams: add a team, name its lead, move a member", async ({ page }) => {
  await open(page, "/admin/members?tab=Teams", "Members & Invitations");
  await main(page).getByLabel("Team name").fill("Lighting lab");
  await main(page).getByLabel("Lead", { exact: true }).selectOption("Theo Marsh");
  await main(page).getByLabel("What the team does").fill("Prototype fittings and compliance tests.");
  await main(page).getByRole("button", { name: "Add team" }).click();
  const lab = main(page).locator(".ds-card").filter({ has: page.getByRole("heading", { name: "Lighting lab", exact: true }) });
  await expect(lab).toContainText("lead Theo Marsh");
  await main(page).getByLabel("Team for Amara Diallo").selectOption({ label: "Lighting lab" });
  await expect(lab).toContainText("Amara Diallo");
  await reload(page);
  await expect(main(page).locator(".ds-card").filter({ has: page.getByRole("heading", { name: "Lighting lab", exact: true }) })).toContainText("Amara Diallo");
});

test("ADMIN privacy register counts each request only once every app's records are in", async ({ page }) => {
  await open(page, "/admin/privacy?tab=Requests", "Privacy & Data Controls");
  const rowan = main(page).getByRole("row", { name: /Rowan Pike — erasure/ });
  await expect(rowan).toContainText(/ERASURE\s*11/i);
  await rowan.getByText("Rowan Pike — erasure of personal data").click();
  await main(page).getByRole("button", { name: "Review request" }).click();
  await expect(dialog(page).getByText("members 1 · employees 1 · payrollRuns 2 · leaveRequests 7")).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("email drafts, calendar day and a meeting fit a phone", async ({ page }) => {
    await open(page, "/comms/email?tab=Drafts", "Email Inbox");
    await expect(page.getByText("No mail service is connected, so nothing is delivered.")).toBeVisible();
    await noHorizontalScroll(page);
    await open(page, "/comms/calendar?tab=Day", "Calendar");
    await expect(main(page).getByText("Winter collection review")).toBeVisible();
    await noHorizontalScroll(page);
    await open(page, "/comms/meetings/nl-meetings-021?tab=Participants", "Meeting");
    await main(page).getByLabel("Answer for Fiona Buchanan").selectOption("declined");
    await expect(main(page).getByText(/1 declined/)).toBeVisible();
    await noHorizontalScroll(page);
    await reload(page);
    await expect(main(page).getByLabel("Answer for Fiona Buchanan")).toHaveValue("declined");
  });
});
