import { expect, test } from "@playwright/test";

test("Roster displays every shift including the next-day part of an overnight shift", async ({ page }) => {
  await page.goto("/o/northline/hr/scheduling?clock=2026-11-17T09%3A00%3A00Z");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: "2026-11-17T09:00:00.000Z" };
    const employee = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Multi Shift Employee", status: "active", fields: { title: "Operations specialist" },
    }, ctx);
    const makeShift = (name: string, startAt: string, endAt: string, hours: number) =>
      repo.newRecord({
        organizationId: "org-northline", currency: "GBP", collection: "shifts",
        title: name, status: "planned", startAt, endAt,
        fields: { kind: "shift", employeeId: employee.id, employeeName: employee.title,
          place: name, hours, timezone: "UTC" },
      }, ctx);
    const morning = makeShift("QA Morning", "2026-11-17T09:00:00.000Z", "2026-11-17T12:00:00.000Z", 3);
    const afternoon = makeShift("QA Afternoon", "2026-11-17T15:00:00.000Z", "2026-11-17T18:00:00.000Z", 3);
    const overnight = makeShift("QA Overnight", "2026-11-17T23:00:00.000Z", "2026-11-18T03:00:00.000Z", 4);
    await repo.putMany([employee, morning, afternoon, overnight], ctx, [], "org-northline");
    return employee.id;
  });
  await page.reload();
  const mobile = await page.evaluate(() => window.matchMedia("(max-width: 767px)").matches);
  const person = mobile
    ? page.locator(".hr-roster-cards .ds-card").filter({ hasText: "QA Multi Shift Employee" }).first()
    : page.getByRole("row", { name: /QA Multi Shift Employee/ });
  await expect(person).toBeVisible();
  await expect(person.locator("button.hr-shift")).toHaveCount(4);
  await expect(person.getByRole("button", { name: /Edit QA Morning/ })).toBeVisible();
  await expect(person.getByRole("button", { name: /Edit QA Afternoon/ })).toBeVisible();
  await expect(person.getByRole("button", { name: /Edit QA Overnight/ })).toHaveCount(2);
  await person.getByRole("button", { name: /Edit QA Afternoon/ }).click();
  await expect(page.getByRole("dialog", { name: "Shift", exact: true })).toBeVisible();
  const count = await page.evaluate(async (employeeId) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const shifts = await repo.listByCollection("org-northline", "shifts");
    return shifts.filter((row) => row.fields.kind === "shift" && row.fields.employeeId === employeeId).length;
  }, id);
  expect(count).toBe(3);
});

test("People timesheet detail drawer shows Project evidence and approves only the selected entry", async ({ page }) => {
  await page.goto("/o/northline/hr/scheduling?tab=Timesheets");
  const ids = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const employee = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Drawer Employee", status: "active", fields: { title: "Designer" },
    }, ctx);
    const project = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "projects",
      title: "QA Drawer Project", status: "planning",
    }, ctx);
    const entry = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "shifts",
      title: "QA Drawer Time", status: "submitted",
      startAt: "2026-11-17T09:00:00.000Z", endAt: "2026-11-17T15:00:00.000Z",
      fields: { kind: "time", employeeId: employee.id, employeeName: employee.title,
        projectId: project.id, hours: 6, approved: false, filedBy: "Maya Chen" },
    }, ctx);
    await repo.putMany([employee, project, entry], ctx, [], "org-northline");
    return { entry: entry.id, employee: employee.id, project: project.id };
  });
  await page.reload();
  await page.getByRole("button", { name: /Needs approval \(/ }).click();
  const mobile = await page.evaluate(() => window.matchMedia("(max-width: 767px)").matches);
  if (mobile) {
    const card = page.locator("#main .ds-record-card").filter({ hasText: "QA Drawer Employee" }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Open", exact: true }).click();
  } else {
    const row = page.getByRole("row", { name: /QA Drawer Employee/ });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Open row ${ids.entry}` }).click();
  }
  const drawer = page.getByRole("dialog", { name: "Review recorded time" });
  await expect(drawer).toContainText("QA Drawer Employee");
  await expect(drawer).toContainText("QA Drawer Project");
  await expect(drawer).toContainText("Awaiting review");
  await drawer.getByRole("button", { name: "Approve hours" }).click();
  await expect(drawer).toHaveCount(0);
  await expect.poll(async () => page.evaluate(async (id) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const record = await repo.getRecord(id);
    return { status: record?.status, approved: record?.fields.approved, approvedBy: record?.fields.approvedBy };
  }, ids.entry)).toEqual({ status: "approved", approved: true, approvedBy: "Maya Chen" });
  await page.getByRole("button", { name: /Approved \(/ }).click();
  await expect(page.locator("#main")).toContainText("QA Drawer Employee");
});
