import { expect, test, type Page } from "@playwright/test";

/* WS6: forms results, IT lifecycle and registers, connector data mapping,
   website SEO fields and app builder responsive preview. Every flow
   reloads to prove the change was written to the workspace. */

async function newForm(page: Page): Promise<string> {
  await page.goto("/o/northline/forms/forms");
  await expect(page.locator("#main")).toBeVisible();
  return page.evaluate(async () => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const form = repo.newRecord({
      organizationId: "org-northline", collection: "forms", currency: "GBP", title: "WS6 Enquiry", status: "live", fields: {},
      body: {
        fields: [
          { id: "q-name", type: "text", label: "Your name", required: true },
          { id: "q-kind", type: "select", label: "Kind of project", required: true, options: ["Home", "Studio", "Other"] },
          { id: "q-other", type: "text", label: "Describe the project", required: true },
          { id: "q-size", type: "number", label: "Rooms", min: 1, max: 20 },
        ],
        logic: [],
      },
    }, ctx);
    await repo.putRecord(form, ctx);
    return form.id;
  });
}

test("Forms: a visibility condition added in the builder is enforced by the live form, and responses tabulate", async ({ page }) => {
  const id = await newForm(page);
  await page.goto(`/o/northline/forms/forms/${id}`);
  const main = page.locator("#main");
  await main.getByText("Describe the project", { exact: true }).first().click();
  const condition = main.getByLabel("Visibility condition");
  await condition.getByLabel("Question to read").selectOption({ label: "Kind of project" });
  await condition.getByLabel("Answer").selectOption("Other");
  await condition.getByRole("button", { name: "Add condition" }).click();
  await expect(condition).toContainText('Kind of project is "Other"');

  await page.reload();
  await page.goto(`/o/northline/forms/forms/${id}/publish?tab=Embed`);
  const form = main.locator("form.t6-formskin").first();
  await expect(form.getByLabel("Describe the project")).toHaveCount(0);
  await form.getByLabel("Your name").fill("Robin");
  await form.getByLabel("Kind of project").selectOption("Other");
  await expect(form.getByLabel("Describe the project")).toBeVisible();
  await form.getByLabel("Rooms").fill("40");
  await form.getByRole("button", { name: "Submit" }).click();
  await expect(form).toContainText("Describe the project is required");
  await expect(form).toContainText("Rooms must be 20 or less");
  await form.getByLabel("Describe the project").fill("A recording studio");
  await form.getByLabel("Rooms").fill("3");
  await form.getByRole("button", { name: "Submit" }).click();
  await expect(main.getByText("A submission record was created")).toBeVisible();

  await page.goto(`/o/northline/forms/forms/${id}/submissions`);
  await page.reload();
  await main.getByRole("group", { name: "Response view" }).getByRole("button", { name: "Results table" }).click();
  const table = main.getByRole("region", { name: "Results table" });
  await expect(table).toContainText("Describe the project");
  await expect(table).toContainText("A recording studio");
  await main.getByRole("group", { name: "Response view" }).getByRole("button", { name: "Question summary" }).click();
  await expect(main).toContainText("1 answered · 0 skipped or hidden");
  const download = page.waitForEvent("download");
  await main.getByRole("group", { name: "Response view" }).getByRole("button", { name: "Results table" }).click();
  await main.getByRole("button", { name: "Download results CSV" }).click();
  expect((await download).suggestedFilename()).toMatch(/ws6-enquiry-responses\.csv$/);
});

test("IT: an incident moves through triage and mitigation with timeline entries that survive reload", async ({ page }) => {
  await page.goto("/o/northline/it/incidents/nl-incidents-050");
  const lifecycle = page.getByLabel("Incident lifecycle");
  await expect(lifecycle.locator('[aria-current="step"]')).toContainText("Open");
  await lifecycle.getByRole("button", { name: "Move to Triage" }).click();
  await expect(lifecycle.locator('[aria-current="step"]')).toContainText("Triage");
  await expect(lifecycle.getByRole("button", { name: "Move to Mitigate" })).toBeDisabled();
  await lifecycle.getByLabel("Mitigation being applied").fill("Asked the browser for persistent storage and exported a backup");
  await lifecycle.getByRole("button", { name: "Move to Mitigate" }).click();
  await expect(lifecycle.locator('[aria-current="step"]')).toContainText("Mitigate");
  await page.reload();
  await expect(page.getByLabel("Incident lifecycle").locator('[aria-current="step"]')).toContainText("Mitigate");
  await page.getByRole("tab", { name: "Timeline" }).click();
  const composer = page.getByLabel("Add a timeline entry");
  await composer.getByLabel("What happened").fill("Checked storage quota on the shared laptop");
  await composer.getByRole("button", { name: "Add to timeline" }).click();
  // Wait for the write to land before reloading, so the reload proves persistence rather than racing it.
  await expect(page.getByLabel("Incident timeline")).toContainText("Checked storage quota on the shared laptop");
  await page.reload();
  const timeline = page.getByLabel("Incident timeline");
  await expect(timeline).toContainText("Checked storage quota on the shared laptop");
  await expect(timeline).toContainText("Moved to Mitigate");
  await page.goto("/o/northline/it/incidents");
  await expect(page.locator("#main")).toContainText("Mitigate");
});

test("IT: change approval is separated from the requester, and access reviews record decisions", async ({ page }) => {
  await page.goto("/o/northline/it/home?tab=Changes");
  const changes = page.getByLabel("Change requests");
  await changes.getByRole("button", { name: /Move the showroom diary/ }).click();
  // Maya Chen requested this change; naming someone else does not let her record its approval.
  await changes.getByLabel("Approver").selectOption("Ada Fernsby");
  await expect(changes).toContainText("You requested this change, so you cannot record its approval");
  await expect(changes.getByRole("button", { name: "Record approval" })).toBeDisabled();
  await changes.getByLabel("Decision note").fill("Hold until the studio calendar owner signs off");
  await changes.getByRole("button", { name: "Record rejection" }).click();
  await expect(changes).toContainText("Submit for approval");
  await page.reload();
  await page.getByLabel("Change requests").getByRole("button", { name: /Move the showroom diary/ }).click();
  await expect(page.getByLabel("Change requests").getByRole("button", { name: "Submit for approval" })).toBeVisible();
  await expect(page.getByLabel("Change requests").getByRole("button", { name: "Record approval" })).toHaveCount(0);

  await page.goto("/o/northline/it/security?tab=Access");
  const reviews = page.getByLabel("Access reviews");
  await reviews.getByRole("button", { name: "Start an access review" }).click();
  await reviews.getByLabel("Decision for Maya Chen").selectOption("keep");
  await reviews.locator(".it-review-row").first().getByRole("button", { name: "Record decision" }).click();
  await expect(reviews).toContainText("Decided by");
  await page.reload();
  await expect(page.getByLabel("Access reviews")).toContainText("Decided by");
  await expect(page.getByLabel("Access reviews").getByRole("button", { name: "Complete the review" })).toBeDisabled();
});

test("IT: assets distinguish local evidence from unconnected remote infrastructure", async ({ page }) => {
  await page.goto("/o/northline/it/health?tab=Provider+status");
  const assets = page.getByLabel("Assets and configuration");
  await expect(assets).toContainText("This browser workspace");
  await expect(assets).toContainText("Remote · not connected");
  await assets.getByRole("button", { name: /Showroom laptop/ }).click();
  await assets.getByLabel("What you checked").fill("Disk encryption is on");
  await assets.getByRole("button", { name: "Record a hand check" }).click();
  await expect(assets).toContainText("Disk encryption is on");
  await page.reload();
  await page.getByLabel("Assets and configuration").getByRole("button", { name: /Showroom laptop/ }).click();
  await expect(page.getByLabel("Assets and configuration")).toContainText("Disk encryption is on");
});

test("CONNECT: a mapping moves a connection from pending to configured to simulated and persists", async ({ page }) => {
  await page.goto("/o/northline/connect/connections/nl-connectors-023?tab=Sync");
  const main = page.locator("#main");
  await expect(main.getByText("Where this connection stands")).toBeVisible();
  await expect(main.getByRole("button", { name: "Save mapping" })).toBeDisabled();
  await main.getByLabel("Arlovi field for event_id").selectOption("externalId");
  await main.getByLabel("Arlovi field for summary").selectOption("title");
  await main.getByLabel("Arlovi field for start").selectOption("at");
  await main.getByRole("button", { name: "Save mapping" }).click();
  await expect(main.getByRole("button", { name: "Simulate with the sample row" })).toBeEnabled();
  await main.getByRole("button", { name: "Simulate with the sample row" }).click();
  await expect(page.getByText("Simulation recorded")).toBeVisible();
  await page.reload();
  await expect(main.getByLabel("Arlovi field for summary")).toHaveValue("title");
  await page.goto("/o/northline/connect/sync?tab=Data+mapping");
  const table = main.getByLabel("Mappings per connection");
  await expect(table.getByRole("row", { name: /Calendar/ })).toContainText("Simulated");
  await expect(table.getByRole("row", { name: /Calendar/ })).toContainText("3 of 5");
});

test("WEB: SEO fields refuse an invalid address and save a valid title", async ({ page }) => {
  await page.goto("/o/northline/web/sites/nl-sites-020/quality?tab=SEO");
  const main = page.locator("#main");
  const address = main.getByLabel("Address");
  await address.fill("/Bad Path");
  await expect(main.getByText(/Use a path like/)).toBeVisible();
  await expect(main.getByRole("button", { name: "Save SEO fields" })).toBeDisabled();
  await address.fill("/");
  await main.getByLabel(/Page title/).fill("Northline Atelier — lighting workshop");
  await main.getByRole("button", { name: "Save SEO fields" }).click();
  await expect(page.getByText("SEO fields saved")).toBeVisible();
  await page.reload();
  await expect(main.getByLabel(/Page title/)).toHaveValue("Northline Atelier — lighting workshop");
});

test("BUILD: the responsive preview stacks components on mobile", async ({ page }) => {
  await page.goto("/o/northline/build/projects/nl-appProjects-020/builder?tab=Responsive");
  const preview = page.getByLabel("Responsive layout preview");
  await preview.getByRole("button", { name: "Mobile 390" }).click();
  await expect(preview).toContainText("Single column");
  await preview.getByRole("button", { name: "Desktop 1280" }).click();
  await expect(preview).toContainText("Twelve columns");
});

test("WS6 screens fit a 390px viewport without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/o/northline/it/incidents/nl-incidents-050",
    "/o/northline/it/home?tab=Changes",
    "/o/northline/connect/connections/nl-connectors-023?tab=Sync",
    "/o/northline/web/sites/nl-sites-020/quality?tab=SEO",
    "/o/northline/forms/forms/nl-forms-020/submissions",
  ]) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
