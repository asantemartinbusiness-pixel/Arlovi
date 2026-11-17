import { expect, test } from "@playwright/test";

test("People roster refuses conflicting moves and saves a valid company Project assignment", async ({ page }) => {
  await page.goto("/o/northline/hr/scheduling");
  const ids = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const ctx = { actor: "Elena Voss", now: new Date().toISOString() };
    const employee = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Scheduling Employee", status: "active", fields: { title: "Designer", employment: "full-time" },
    }, ctx);
    const other = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Another Scheduler", status: "active", fields: { title: "Designer", employment: "full-time" },
    }, ctx);
    const project = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "projects",
      title: "QA Scheduling Project", status: "planning", fields: { kind: "project" },
    }, ctx);
    const makeShift = (employeeId: string, title: string) => repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "shifts",
      title, status: "planned", startAt: "2026-11-18T09:00:00.000Z", endAt: "2026-11-18T17:00:00.000Z",
      fields: { kind: "shift", employeeId, employeeName: title, place: "Workshop bench", hours: 8, timezone: "UTC" },
    }, ctx);
    const current = makeShift(employee.id, employee.title);
    const clash = makeShift(other.id, other.title);
    await repo.putMany([employee, other, project, current, clash], ctx, [], "org-northline");
    return { employee: employee.id, other: other.id, project: project.id, shift: current.id };
  });
  await page.reload();
  const row = page.getByRole("row", { name: /QA Scheduling Employee/ });
  await expect(row).toBeVisible();
  await row.locator("button.hr-shift").click();
  const dialog = page.getByRole("dialog", { name: "Shift", exact: true });
  await expect(dialog).toBeVisible();

  await dialog.getByLabel("Person").selectOption(ids.other);
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(dialog).toBeVisible();
  const unchanged = await page.evaluate(async (id) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const shift = await repo.getRecord(id);
    return shift?.fields.employeeId;
  }, ids.shift);
  expect(unchanged).toBe(ids.employee);

  await dialog.getByLabel("Person").selectOption(ids.employee);
  await dialog.getByLabel("Project assignment").selectOption(ids.project);
  await dialog.getByLabel("Hours").fill("9");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => page.evaluate(async (id) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const shift = await repo.getRecord(id);
    return { projectId: shift?.fields.projectId, hours: shift?.fields.hours,
      endAt: shift?.endAt, timezone: shift?.fields.timezone };
  }, ids.shift)).toEqual({
    projectId: ids.project, hours: 9, endAt: "2026-11-18T18:00:00.000Z", timezone: "UTC",
  });
});

test("submitted time is a live Inbox decision and disappears after the linked local approval", async ({ page }) => {
  await page.goto("/o/northline/hr/scheduling");
  const ids = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Elena Voss", now: new Date().toISOString() };
    const employee = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "employees",
      title: "QA Hours Employee", status: "active", fields: { title: "Designer" },
    }, ctx);
    const project = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "projects",
      title: "QA Hours Project", status: "planning",
    }, ctx);
    const entry = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "shifts",
      title: "QA Submitted Hours", status: "submitted", startAt: "2026-11-17T10:00:00.000Z",
      fields: { kind: "time", employeeId: employee.id, employeeName: employee.title,
        projectId: project.id, hours: 6, approved: false, billable: true },
    }, ctx);
    await repo.putMany([employee, project, entry], ctx, [], "org-northline");
    return { entry: entry.id, employee: employee.id, project: project.id };
  });
  await page.goto("/o/northline/inbox/inbox");
  await page.getByRole("button", { name: "Needs me", exact: true }).click();
  await expect(page.locator("#main")).toContainText("Approve time: QA Hours Employee");

  const approved = await page.evaluate(async (ids) => {
    const repoPath = "/src/platform/repo.ts";
    const workforcePath = "/src/applications/hr/workforce.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const workforce = await import(/* @vite-ignore */ workforcePath) as typeof import("../src/applications/hr/workforce");
    const entry = await repo.getRecord(ids.entry);
    const employees = await repo.listByCollection("org-northline", "employees");
    const projects = await repo.listByCollection("org-northline", "projects");
    if (!entry) throw new Error("Entry missing");
    const ctx = { organizationId: "org-northline", currency: "GBP", actor: "Elena Voss",
      now: new Date().toISOString(), timezone: "Europe/London" };
    const plan = workforce.planTimesheetApprovals(ctx, [entry], employees, projects);
    await repo.putMany(plan.records, { actor: ctx.actor, now: ctx.now },
      plan.messages.map((message, i) => ({
        type: plan.eventTypes[i], entityId: plan.records[i].id, message,
      })), ctx.organizationId, plan.expectedRevisions);
    return (await repo.getRecord(ids.entry))?.status;
  }, ids);
  expect(approved).toBe("approved");
  await expect(page.locator("#main")).not.toContainText("Approve time: QA Hours Employee");
  await page.goto("/o/northline/hr/scheduling?tab=Timesheets");
  await expect(page.locator("#main")).toContainText("QA Hours Employee");
  await expect(page.locator("#main")).toContainText("QA Hours Project");
});

test("Project Time records a real People employee and task, never a fabricated billing rate", async ({ page }) => {
  await page.goto("/o/northline/project/time");
  const ids = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const employee = repo.newRecord({
      organizationId: "org-northline", collection: "employees", currency: "GBP",
      title: "QA Project Time Employee", status: "active",
      fields: { title: "Engineer", employment: "full-time" },
    }, ctx);
    const project = repo.newRecord({
      organizationId: "org-northline", collection: "projects", currency: "GBP",
      title: "QA Project Time Assignment", status: "planning",
      fields: { priority: "normal" },
    }, ctx);
    const task = repo.newRecord({
      organizationId: "org-northline", collection: "tasks", currency: "GBP",
      title: "QA Recorded Project Task", status: "backlog", parentId: project.id,
      fields: { kind: "task", stage: "backlog", assignee: employee.title },
    }, ctx);
    await repo.putMany([employee, project, task], ctx, [], "org-northline");
    return { employee: employee.id, project: project.id, task: task.id };
  });
  await page.reload();
  await page.getByRole("button", { name: "Log time", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Log time", exact: true });
  await dialog.getByLabel("Person who did the work").selectOption(ids.employee);
  await dialog.getByLabel("Project task").selectOption(ids.task);
  await dialog.getByLabel("Minutes worked").fill("45");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await page.evaluate(async (ids) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const times = await repo.listByCollection("org-northline", "shifts");
    const found = times.filter((row) => row.fields.kind === "time" && row.fields.taskId === ids.task);
    return found.map((row) => ({
      employeeId: row.fields.employeeId, projectId: row.fields.projectId,
      hours: row.fields.hours, approved: row.fields.approved,
      hasRate: row.fields.rateMinor !== undefined, status: row.status,
    }));
  }, ids);
  expect(saved).toEqual([{
    employeeId: ids.employee, projectId: ids.project, hours: 0.75,
    approved: false, hasRate: false, status: "submitted",
  }]);
  await page.goto("/o/northline/inbox/inbox");
  await page.getByRole("button", { name: "Needs me", exact: true }).click();
  await expect(page.locator("#main")).toContainText("Approve time: QA Project Time Employee");
});
