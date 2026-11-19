import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * WS3 business operations: the contract workspace (LEGAL), case triage
 * (CARE), task editing and project health (PROJECT) and conversation
 * composition (COMMS). Every change is checked again after a reload.
 *
 *   BASE_URL=http://127.0.0.1:5183 npx playwright test e2e/ws3-operations.spec.ts --workers=1
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
/** Dismiss confirmation toasts so they do not cover the next control. */
async function dismissToasts(page: Page): Promise<void> {
  const buttons = page.locator(".ds-toasts").getByRole("button", { name: "Dismiss" });
  for (let i = await buttons.count(); i > 0; i -= 1) await buttons.first().click().catch(() => undefined);
}

const card = (page: Page, title: string): Locator => main(page).locator(".ds-card").filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test("LEGAL register filters by counterparty and renewal window", async ({ page }) => {
  await open(page, "/legal/contracts", "Contract Library");
  await expect(main(page).getByText(/contracts? needs? a renewal decision/)).toBeVisible();
  await page.getByRole("tab", { name: "Active" }).click();
  const counterparty = main(page).getByLabel("Counterparty");
  await counterparty.selectOption("Marchbank Estates");
  await expect(main(page).getByRole("row", { name: /Clerkenwell studio lease/ })).toBeVisible();
  await expect(main(page).getByRole("row", { name: /Vale & Co/ })).toHaveCount(0);
  await main(page).getByRole("button", { name: "Clear filters" }).first().click();
  await page.getByRole("tab", { name: "Expiring" }).click();
  await main(page).getByLabel("Renewal window").selectOption("passed");
  await expect(main(page).getByRole("row", { name: /Kestrel Brokers/ })).toContainText(/Notice date passed/i);
  // The filter is kept when the tab changes.
  await page.getByRole("tab", { name: "Active" }).click();
  await expect(main(page).getByLabel("Renewal window")).toHaveValue("passed");
});

test("LEGAL contract workspace: obligations, review cycle, key dates, links and versions persist", async ({ page }) => {
  // Projects are loaded with the Projects application; open it once so the contract can link one.
  await open(page, "/project/projects");
  await expect(main(page).getByText("Clerkenwell showroom refit").first()).toBeVisible();
  await open(page, "/legal/contracts/nl-contracts-020", "Thames Timber");

  // Obligations: add one, complete it.
  const obligations = card(page, "Obligations from this contract");
  await obligations.getByRole("button", { name: "Add an obligation" }).click();
  await obligations.getByRole("textbox", { name: "Obligation", exact: true }).fill("Confirm kiln schedule in writing");
  await obligations.locator('input[name="due"]').fill("2026-11-28");
  await obligations.getByRole("button", { name: "Save obligation" }).click();
  await expect(obligations.getByText("Confirm kiln schedule in writing")).toBeVisible();
  await obligations.getByRole("button", { name: "Complete Confirm kiln schedule in writing" }).click();
  await expect(obligations.getByRole("button", { name: "Reopen Confirm kiln schedule in writing" })).toBeVisible();

  // Review cycle: request a review, then record a decision that sends it back.
  const review = card(page, "Review cycle");
  await review.getByRole("button", { name: "Request a review" }).click();
  await dialog(page).getByLabel("Reviewer").selectOption({ index: 1 });
  await dialog(page).getByRole("button", { name: "Request review" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await review.getByLabel("Decision", { exact: true }).selectOption("changes_requested");
  await expect(review.getByRole("button", { name: "Record the decision" })).toBeDisabled();
  await review.getByLabel("Reason (required)").fill("Liability cap must cover delay costs.");
  await review.getByRole("button", { name: "Record the decision" }).click();
  await expect(review.getByText("Changes requested")).toBeVisible();

  // Key dates: record a renewal decision.
  const dates = card(page, "Key dates and renewal");
  await dates.getByRole("button", { name: "Edit dates" }).click();
  await dates.getByLabel("Renewal decision").selectOption("renegotiate");
  await dates.getByRole("button", { name: "Save key dates" }).click();
  await expect(dates.getByText(/Decided: renegotiate/)).toBeVisible();

  // Links: point the contract at a project.
  const links = card(page, "Linked records");
  await links.getByRole("button", { name: "Edit links" }).click();
  await links.getByLabel("Project").selectOption({ label: "Clerkenwell showroom refit" });
  await links.getByRole("button", { name: "Save links" }).click();
  await expect(links.getByText("Clerkenwell showroom refit")).toBeVisible();

  await reload(page);
  await expect(card(page, "Obligations from this contract").getByRole("button", { name: "Reopen Confirm kiln schedule in writing" })).toBeVisible();
  await expect(card(page, "Review cycle").getByText("Liability cap must cover delay costs.")).toBeVisible();
  await expect(main(page).locator(".lg-stage[data-state='current']")).toHaveText("draft");
  await expect(card(page, "Key dates and renewal").getByText(/Decided: renegotiate/)).toBeVisible();
  await card(page, "Linked records").getByRole("button", { name: "Open project" }).click();
  await expect(page).toHaveURL(/\/project\/projects\/nl-projects-020/);

  // A stored version appears in History and survives a reload.
  await open(page, "/legal/contracts/nl-contracts-020", "Thames Timber");
  await page.getByRole("tab", { name: "History" }).click();
  await main(page).getByRole("button", { name: "Store a new version" }).click();
  const versionForm = main(page).getByRole("form", { name: "Store a new version" });
  await versionForm.getByRole("textbox").nth(0).fill("Counter-proposal");
  await versionForm.getByRole("textbox").nth(1).fill("Delay beyond twenty-one days entitles the customer to cancel.");
  await versionForm.getByRole("button", { name: "Store version" }).click();
  await expect(main(page).getByRole("row", { name: /Counter-proposal/ })).toBeVisible();
  await reload(page);
  await page.getByRole("tab", { name: "History" }).click();
  await expect(main(page).getByRole("row", { name: /Counter-proposal/ })).toBeVisible();
});

test("CARE triage: SLA view, saved draft, unsent reply, triage moves and resolution reason", async ({ page }) => {
  await open(page, "/care/inbox", "Omnichannel Inbox");
  await page.getByRole("tab", { name: "Team" }).click();
  await main(page).getByRole("button", { name: /^SLA risk/ }).click();
  const list = main(page).getByRole("listbox", { name: "Team cases" });
  await expect(list.getByRole("option").first()).toBeVisible();
  await expect(list.getByRole("option").first()).toContainText(/over|in /i);
  await main(page).getByRole("button", { name: /^All/ }).click();

  await page.getByRole("tab", { name: "Unassigned" }).click();
  const first = main(page).getByRole("listbox", { name: "Unassigned cases" }).getByRole("option").first();
  await first.click();
  const reply = main(page).getByRole("textbox", { name: /^Reply to/ });
  await reply.fill("We will confirm a trade owner for this today.");
  await main(page).getByRole("button", { name: "Save draft" }).click();
  await expect(main(page).getByText(/Draft saved on the case/)).toBeVisible();
  await reload(page);
  await expect(main(page).getByRole("textbox", { name: /^Reply to/ })).toHaveValue("We will confirm a trade owner for this today.");
  await main(page).getByRole("button", { name: "Record the reply" }).click();
  await expect(main(page).getByText("Recorded — not sent").first()).toBeVisible();

  // Contracts are loaded with the Legal application; open it once so the case can match one.
  await open(page, "/legal/contracts", "Contract Library");
  await page.getByRole("tab", { name: "Active" }).click();
  await expect(main(page).getByText("Mutual NDA — Delacroix").first()).toBeVisible();
  await open(page, "/care/tickets/nl-tickets-041", "Case");
  const triage = card(page, "Triage");
  await triage.getByLabel("Case priority").selectOption("urgent");
  await triage.getByRole("button", { name: "Assign to me" }).click();
  await dismissToasts(page);
  await triage.getByRole("button", { name: "Waiting on customer" }).click();
  await expect(triage.getByText("Waiting on customer").first()).toBeVisible();
  const resolution = card(page, "Resolution");
  await resolution.getByLabel("Resolution reason").selectOption("Replacement arranged");
  await dismissToasts(page);
  await resolution.getByRole("button", { name: "Mark resolved" }).click();
  await expect(resolution.getByText("Replacement arranged")).toBeVisible();
  await reload(page);
  await expect(card(page, "Resolution").getByText("Replacement arranged")).toBeVisible();
  await expect(card(page, "Triage").getByLabel("Case priority")).toHaveValue("urgent");
  await expect(card(page, "Linked records").getByRole("button", { name: "Open contract" }).first()).toBeVisible();
});

test("PROJECT subtasks and dependency links persist; health check is shown", async ({ page }) => {
  await open(page, "/project/tasks/nl-tasks-024", "Repaint and make good");
  await expect(card(page, "Dependencies").getByText(/Waiting on 2 unfinished tasks/)).toBeVisible();
  await card(page, "Dependencies").getByRole("button", { name: "Remove the link to Trade counter joinery" }).click();
  await expect(card(page, "Dependencies").getByText(/Waiting on 1 unfinished task/)).toBeVisible();
  await page.getByRole("tab", { name: "Subtasks" }).click();
  await main(page).getByLabel("New subtask").fill("Mask the trade counter");
  await main(page).getByRole("button", { name: "Add", exact: true }).click();
  await expect(main(page).getByRole("checkbox", { name: "Mask the trade counter" })).toBeVisible();
  await main(page).getByRole("checkbox", { name: "Mask the trade counter" }).click();
  await expect(main(page).getByRole("checkbox", { name: "Mask the trade counter" })).toBeChecked();
  await reload(page);
  await page.getByRole("tab", { name: "Subtasks" }).click();
  await expect(main(page).getByRole("checkbox", { name: "Mask the trade counter" })).toBeChecked();
  await page.getByRole("tab", { name: "Details" }).click();
  await expect(card(page, "Dependencies").getByText(/Waiting on 1 unfinished task/)).toBeVisible();

  await open(page, "/project/projects/nl-projects-020");
  await expect(card(page, "Health check").getByRole("list", { name: "Health signals" })).toBeVisible();
});

test("COMMS conversation search and mention picker", async ({ page }) => {
  await open(page, "/comms/channels/nl-channels-020");
  const search = main(page).getByRole("searchbox", { name: /^Search/ });
  await search.fill("zzzz-no-such-text");
  await expect(main(page).getByText("No message matches")).toBeVisible();
  await search.fill("");
  const composer = main(page).getByRole("textbox", { name: /^Message/ });
  await composer.fill("Can you check this @Pri");
  await main(page).getByRole("option", { name: "Priya Shah" }).click();
  await expect(composer).toHaveValue("Can you check this @Priya Shah ");
  await composer.fill("Can you check the glaze batch @Priya Shah ");
  await main(page).getByRole("button", { name: "Send" }).click();
  await reload(page);
  await expect(main(page).locator("mark.cm-mention", { hasText: "@Priya Shah" }).last()).toBeVisible();
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("contract workspace and care inbox fit a phone", async ({ page }) => {
    await open(page, "/legal/contracts/nl-contracts-024", "Kestrel Brokers");
    await expect(card(page, "Key dates and renewal").getByText("The notice date has passed")).toBeVisible();
    const obligations = card(page, "Obligations from this contract");
    await obligations.scrollIntoViewIfNeeded();
    await obligations.getByRole("button", { name: /^Complete / }).first().click();
    await expect(obligations.getByRole("button", { name: /^Reopen / }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await reload(page);
    await expect(card(page, "Obligations from this contract").getByRole("button", { name: /^Reopen / }).first()).toBeVisible();

    await open(page, "/care/inbox", "Omnichannel Inbox");
    await expect(main(page).getByRole("button", { name: /^SLA risk/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
