import { expect, test, type Page } from "@playwright/test";

/* W2F: forms preview runs, website page manager and submenus, app builder
   data binding and interactions, connector detail routing. Each flow
   asserts the saved state, reloads, and asserts it again. */

const stamp = () => Date.now().toString(36);

async function seed(page: Page, records: Record<string, unknown>[]): Promise<string[]> {
  await page.goto("/o/northline/hq/home");
  await expect(page.locator("#main")).toBeVisible();
  return page.evaluate(async (items) => {
    const modulePath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ modulePath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const ids: string[] = [];
    for (const item of items) {
      const record = repo.newRecord({ organizationId: "org-northline", currency: "GBP", fields: {}, ...item } as Parameters<typeof repo.newRecord>[0], ctx);
      await repo.putRecord(record, ctx);
      ids.push(record.id);
    }
    return ids;
  }, records);
}

test("FORMS: a finished preview is kept as a preview run, not a response, and survives reload", async ({ page }) => {
  const [id] = await seed(page, [{
    collection: "forms", title: "W2F Preview form", status: "draft",
    body: { fields: [
      { id: "q-name", type: "text", label: "Your name", required: true },
      { id: "q-kind", type: "select", label: "Kind", options: ["Home", "Other"] },
      { id: "q-why", type: "text", label: "Tell us more" },
    ], logic: [{ id: "l1", targetId: "q-why", action: "show", whenFieldId: "q-kind", operator: "equals", value: "Other" }] },
  }]);
  await page.goto(`/o/northline/forms/forms/${id}?tab=Preview`);
  const main = page.locator("#main");
  const runs = main.getByLabel("Preview runs", { exact: true });
  await expect(runs).toContainText("No preview runs yet");
  const form = main.locator("form.t6-formskin").first();
  await form.getByRole("button", { name: "Check the answers" }).click();
  await expect(form).toContainText("Your name is required");
  await form.getByLabel("Your name").fill("Robin Preview");
  await form.getByLabel("Kind").selectOption("Home");
  await form.getByRole("button", { name: "Check the answers" }).click();
  await expect(main.getByText("Kept as a preview run on this form")).toBeVisible();
  await expect(runs.getByLabel("Preview run answers")).toContainText("Robin Preview");
  await expect(runs.getByLabel("Kept preview runs")).toContainText("1 hidden by logic");

  await page.reload();
  await expect(main.getByLabel("Preview runs", { exact: true }).getByLabel("Preview run answers")).toContainText("Robin Preview");
  // Not a response: the submissions inbox for this form stays empty.
  await page.goto(`/o/northline/forms/forms/${id}/submissions`);
  await expect(main.getByText("Robin Preview")).toHaveCount(0);
  await expect(main.getByText(/No (all )?submissions/i).first()).toBeVisible();

  await page.goto(`/o/northline/forms/forms/${id}?tab=Preview`);
  await main.getByRole("button", { name: "Clear preview runs" }).click();
  await expect(main.getByLabel("Preview runs", { exact: true })).toContainText("No preview runs yet");
});

test("WEB: pages are added, moved with a redirect, nested in the menu and deleted, and persist", async ({ page }) => {
  const [id] = await seed(page, [{
    collection: "sites", title: `W2F Site ${stamp()}`, status: "draft",
    body: {
      pages: [
        { id: "home", name: "Home", path: "/", blocks: [{ id: "b1", type: "hero", props: { title: "Welcome", ctaLabel: "About", ctaTarget: "/about" } }] },
        { id: "about", name: "About", path: "/about", blocks: [] },
      ],
      nav: { header: [
        { id: "n1", label: "Home", target: "/", kind: "page", children: [] },
        { id: "n2", label: "About", target: "/about", kind: "page", children: [] },
      ], footer: [], redirects: [] },
    },
  }]);
  await page.goto(`/o/northline/web/sites/${id}/builder`);
  const main = page.locator("#main");
  await main.getByLabel("Website editor overview").getByRole("button", { name: "Pages" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Add a page" }).click();
  await drawer.getByLabel("Page name").first().fill("Opening hours");
  await expect(drawer.getByLabel("Address").first()).toHaveValue("/opening-hours");
  await drawer.getByRole("button", { name: "Add the page" }).click();
  await expect(drawer.getByLabel("Pages in this site")).toContainText("/opening-hours");

  await drawer.getByLabel("Pages in this site").getByRole("button", { name: /^About/ }).click();
  const settings = drawer.getByLabel("Page settings for About");
  await settings.getByLabel("Address").fill("/studio");
  await expect(settings).toContainText("/about will redirect here (301)");
  await settings.getByRole("button", { name: "Save page settings" }).click();
  await expect(drawer.getByLabel("Pages in this site")).toContainText("/studio");
  await page.keyboard.press("Escape");

  await page.goto(`/o/northline/web/sites/${id}/navigation`);
  await expect(main.getByText("/studio").first()).toBeVisible();
  await main.getByRole("button", { name: "Add sub-link" }).nth(1).click();
  const picker = page.getByRole("dialog");
  await picker.getByLabel("Link text").fill("Hours");
  await picker.getByLabel("Page").selectOption({ label: "Opening hours · /opening-hours" });
  await expect(picker.getByLabel("Place in menu")).toHaveValue(/.+/);
  await picker.locator("form#link-picker").evaluate((form: HTMLFormElement) => form.requestSubmit());
  await expect(main.getByLabel("Submenu of About")).toContainText("Hours");

  await page.reload();
  await expect(main.getByLabel("Submenu of About")).toContainText("Hours");
  await page.goto(`/o/northline/web/sites/${id}/navigation?tab=Redirects`);
  await expect(main.getByRole("row", { name: /\/about.*\/studio/ })).toBeVisible();

  await page.goto(`/o/northline/web/sites/${id}?tab=Pages`);
  await main.getByRole("button", { name: "Manage pages" }).click();
  await page.getByRole("dialog").getByLabel("Pages in this site").getByRole("button", { name: /^Opening hours/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete the page" }).click();
  await expect(page.getByRole("dialog").getByLabel("Pages in this site")).not.toContainText("/opening-hours");
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(main.getByRole("table", { name: "Pages" })).not.toContainText("/opening-hours");
  await page.goto(`/o/northline/web/sites/${id}/navigation`);
  await expect(main.getByLabel("Submenu of About")).toHaveCount(0);
});

test("BUILD: a filtered, sorted table opens the chosen record on a detail screen in the preview", async ({ page }) => {
  const batch = `W2F-${stamp()}`;
  const ids = await seed(page, [
    { collection: "tasks", title: `${batch} Alpha`, status: "ready", fields: { Batch: batch, Priority: "3" } },
    { collection: "tasks", title: `${batch} Bravo`, status: "ready", fields: { Batch: batch, Priority: "9" } },
    { collection: "tasks", title: `${batch} Charlie`, status: "ready", fields: { Batch: "other", Priority: "5" } },
  ]);
  expect(ids).toHaveLength(3);
  const [project] = await seed(page, [{
    collection: "appProjects", title: `W2F Binding ${batch}`, status: "draft",
    body: {
      entities: [{ id: "e-task", name: "Task", collection: "tasks", fields: [
        { id: "f-title", name: "Title", kind: "text", required: true, unique: false, options: [], references: "" },
        { id: "f-batch", name: "Batch", kind: "text", required: false, unique: false, options: [], references: "" },
        { id: "f-priority", name: "Priority", kind: "number", required: false, unique: false, options: [], references: "" },
      ] }],
      screens: [
        { id: "s-list", name: "Task list", route: "/tasks", components: [
          { id: "c-table", kind: "table", title: "Batch tasks", entityId: "e-task", fieldIds: ["f-title", "f-priority"], aggregate: "count", text: "", span: 12 },
        ] },
        { id: "s-detail", name: "Task detail", route: "/tasks/detail", components: [
          { id: "c-detail", kind: "detail", title: "Task", entityId: "e-task", fieldIds: ["f-title", "f-priority"], aggregate: "count", text: "", span: 12 },
        ] },
      ],
      automations: [], roles: [], versions: [], endpoints: [], releases: [], files: [],
    },
  }]);

  await page.goto(`/o/northline/build/projects/${project}/builder?tab=Design`);
  const main = page.locator("#main");
  await main.getByText("Batch tasks", { exact: true }).first().click();
  const shown = main.getByLabel("Records shown");
  await shown.getByRole("button", { name: "Add a filter" }).click();
  await shown.getByLabel("Filter 1 field").selectOption({ label: "Batch" });
  await shown.getByLabel("Filter 1 value").fill(batch);
  await shown.getByLabel("Filter 1 value").press("Enter");
  await shown.getByLabel("Sort field").selectOption({ label: "Priority" });
  await shown.getByLabel("Sort direction").selectOption("desc");
  const interaction = main.getByLabel("Interaction");
  await interaction.getByLabel("Action").selectOption("open_record");
  await interaction.getByLabel("Screen").selectOption({ label: "Task detail · /tasks/detail" });
  await expect(shown).toContainText(`where Batch is "${batch}", sorted by Priority descending`);
  await expect(main.getByText("opens Task detail")).toBeVisible();

  await page.reload();
  await main.getByText("Batch tasks", { exact: true }).first().click();
  await expect(main.getByLabel("Records shown")).toContainText(`where Batch is "${batch}"`);

  await page.goto(`/o/northline/build/projects/${project}/builder?tab=Preview`);
  const table = main.getByRole("table", { name: "Batch tasks" });
  await expect(table.locator("tbody tr")).toHaveCount(2);
  await expect(table.locator("tbody tr").first()).toContainText("Bravo");
  await expect(table).not.toContainText("Charlie");
  await table.locator("tbody tr").first().click();
  await expect(main.getByLabel("Preview path")).toContainText("Opened from Batch tasks");
  await expect(main.getByText("the chosen record")).toBeVisible();
  await expect(main.getByText(`${batch} Bravo`).first()).toBeVisible();
  await main.getByLabel("Preview path").getByRole("button", { name: "Back to Task list" }).click();
  await expect(main.getByRole("table", { name: "Batch tasks" })).toBeVisible();
});

test("CONNECT: connector details open by the workspace record and keep working through the tabs", async ({ page }) => {
  await page.goto("/o/northline/connect/marketplace");
  const main = page.locator("#main");
  await main.locator(".connect-marketplace-card").first().getByRole("button", { name: "View details" }).click();
  await expect(page).toHaveURL(/\/connect\/marketplace\/nl-connectors-\d+/);
  const detail = main.getByLabel("Connector details overview");
  await expect(detail).toBeVisible();
  await expect(detail).not.toContainText("$");
  await detail.getByRole("button", { name: "Review permissions" }).click();
  await expect(page).toHaveURL(/tab=Permissions/);
  await page.reload();
  await expect(main.getByLabel("Connector details overview")).toBeVisible();
  await expect(main.getByText("Record not found")).toHaveCount(0);
});

test("W2F screens fit a 390px viewport without horizontal page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/o/northline/forms/forms/nl-forms-020?tab=Preview",
    "/o/northline/web/sites/nl-sites-020/navigation",
    "/o/northline/build/projects/nl-appProjects-020/builder?tab=Preview",
    "/o/northline/connect/marketplace/nl-connectors-002",
  ]) {
    await page.goto(path);
    await expect(page.locator("#main")).toBeVisible();
    await expect(page.locator("#main h1").first()).not.toHaveText(/Checking record access|Record not found/);
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
  await page.goto("/o/northline/web/sites/nl-sites-020/builder");
  await page.locator("#main").getByLabel("Website editor overview").getByRole("button", { name: "Pages" }).click();
  await expect(page.getByRole("dialog").getByLabel("Pages in this site")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
