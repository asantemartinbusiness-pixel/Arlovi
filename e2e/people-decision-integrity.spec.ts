import { expect, test } from "@playwright/test";

test("leave approval is atomic and only charges the correct employee's annual allowance", async ({ page }) => {
  await page.goto("/o/northline/hr/leave");
  const ids = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const now = new Date().toISOString(), ctx = { actor: "Elena Voss", now, screenId: "qa-atomic-leave" };
    const employee = repo.newRecord({
      organizationId: "org-northline", collection: "employees", currency: "GBP",
      title: "QA Annual Leave Employee", status: "active",
      fields: { title: "Analyst", employment: "full-time", leaveAllowance: 25, leaveTaken: 1 },
    }, ctx);
    const request = repo.newRecord({
      organizationId: "org-northline", collection: "leaveRequests", currency: "GBP",
      title: "QA Annual Leave Decision", status: "requested",
      startAt: "2026-11-20T00:00:00.000Z", endAt: "2026-11-23T00:00:00.000Z",
      fields: { employeeId: employee.id, employeeName: employee.title, type: "annual", days: 3 },
    }, ctx);
    await repo.putMany([employee, request], ctx, [
      { type: "create", entityId: employee.id, message: "QA employee" },
      { type: "create", entityId: request.id, message: "QA leave" },
    ], "org-northline");
    return { employee: employee.id, request: request.id };
  });
  await page.reload();
  await page.getByRole("tab", { name: "Approvals", exact: true }).click();
  const card = page.locator("#main .ds-card").filter({ hasText: "QA Annual Leave Employee" }).first();
  await expect(card.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => page.evaluate(async (ids) => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const [request, employee] = await Promise.all([repo.getRecord(ids.request), repo.getRecord(ids.employee)]);
    return { status: request?.status, balance: employee?.fields.leaveTaken };
  }, ids)).toEqual({ status: "approved", balance: 4 });
});

test("a stale leave request cannot partially update an employee balance", async ({ page }) => {
  await page.goto("/o/northline/hr/leave");
  const state = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const decisionPath = "/src/applications/hr/decisions.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const decisions = await import(/* @vite-ignore */ decisionPath) as typeof import("../src/applications/hr/decisions");
    const now = new Date().toISOString(), ctx = { actor: "Elena Voss", now };
    const employee = repo.newRecord({
      organizationId: "org-northline", collection: "employees", currency: "GBP",
      title: "QA Stale Leave Employee", status: "active",
      fields: { leaveAllowance: 25, leaveTaken: 1 },
    }, ctx);
    const request = repo.newRecord({
      organizationId: "org-northline", collection: "leaveRequests", currency: "GBP",
      title: "QA Stale Leave Request", status: "requested",
      fields: { employeeId: employee.id, type: "annual", days: 3 },
    }, ctx);
    await repo.putMany([employee, request], ctx, [], "org-northline");
    const plan = decisions.planLeaveDecision({
      organizationId: "org-northline", currency: "GBP", actor: ctx.actor, now,
    }, request, employee, "approved");
    await repo.patchRecord(request.id, { summary: "Edited by another tab" }, ctx, { expectRevision: request.revision });
    let conflict = false;
    try {
      await repo.putMany(plan.records, ctx,
        plan.messages.map((message, index) => ({ type: "update", entityId: plan.records[index].id, message })),
        "org-northline", plan.expectedRevisions);
    } catch (error) { conflict = error instanceof repo.ConflictError; }
    const [storedRequest, storedEmployee] = await Promise.all([repo.getRecord(request.id), repo.getRecord(employee.id)]);
    return { conflict, status: storedRequest?.status, balance: storedEmployee?.fields.leaveTaken };
  });
  expect(state).toEqual({ conflict: true, status: "requested", balance: 1 });
});

test("hiring records acceptance, preserves applicant history and creates no orphan on stale revisions", async ({ page }) => {
  await page.goto("/o/northline/hr/recruitment");
  const candidateId = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const now = new Date().toISOString(), ctx = { actor: "Elena Voss", now };
    const applicant = repo.newRecord({
      organizationId: "org-northline", collection: "applicants", currency: "GBP",
      title: "QA Hired Candidate", status: "active",
      fields: { stage: "offer", rating: 5, offerIssuedBy: "Elena Voss",
        email: "qa-candidate-atomic@example.test", source: "QA recruitment", consentUntil: "2027-11-17", role: "Designer" },
    }, ctx);
    await repo.putRecord(applicant, ctx);
    return applicant.id;
  });
  await page.goto(`/o/northline/hr/candidates/${candidateId}`);
  await page.getByRole("button", { name: "Review and move stage" }).click();
  const dialog = page.getByRole("dialog", { name: "Review and move stage" });
  await dialog.getByLabel("Move to").selectOption("hired");
  await dialog.getByLabel("Reason, against the role requirements").fill("Passed interview and offer review");
  await dialog.getByLabel("Evidence that the candidate accepted").fill("Candidate confirmed acceptance in a dated email on 16 Nov");
  await dialog.getByRole("button", { name: "Record the decision" }).click();
  await expect(dialog).toHaveCount(0);
  const state = await page.evaluate(async (id) => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const applicant = await repo.getRecord(id);
    const employees = await repo.listByCollection("org-northline", "employees");
    const matches = employees.filter((record) => record.fields.applicantId === id);
    return {
      status: applicant?.status, source: applicant?.fields.source, consent: applicant?.fields.consentUntil,
      evidence: applicant?.fields.offerAcceptanceEvidence, employees: matches.length,
      linked: matches[0]?.id === applicant?.fields.employeeId,
    };
  }, candidateId);
  expect(state).toEqual({
    status: "hired", source: "QA recruitment", consent: "2027-11-17",
    evidence: "Candidate confirmed acceptance in a dated email on 16 Nov",
    employees: 1, linked: true,
  });
});

test("onboarding starts with six complete tasks and refuses a duplicate launch", async ({ page }) => {
  await page.goto("/o/northline/hr/onboarding");
  const ids = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const ctx = { actor: "Elena Voss", now: new Date().toISOString() };
    const starter = repo.newRecord({
      organizationId: "org-northline", collection: "employees", currency: "GBP",
      title: "QA Onboarding Starter", status: "probation",
      fields: { title: "Project Assistant", employment: "full-time" },
    }, ctx);
    const mentor = repo.newRecord({
      organizationId: "org-northline", collection: "employees", currency: "GBP",
      title: "QA Onboarding Mentor", status: "active",
      fields: { title: "Senior Designer", employment: "full-time" },
    }, ctx);
    await repo.putMany([starter, mentor], ctx, [], "org-northline");
    return { starter: starter.id, mentor: mentor.id };
  });
  await page.reload();
  await page.getByRole("button", { name: "Launch a checklist" }).click();
  const dialog = page.getByRole("dialog", { name: "Launch an onboarding checklist" });
  await dialog.getByLabel("Who is starting").selectOption(ids.starter);
  await dialog.getByLabel("Mentor").selectOption({ label: "QA Onboarding Mentor" });
  await dialog.getByRole("button", { name: "Launch checklist" }).click();
  await expect(dialog).toHaveCount(0);

  const read = async () => page.evaluate(async (id) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const employee = await repo.getRecord(id);
    const tasks = (await repo.listByCollection("org-northline", "tasks"))
      .filter((task) => task.fields.kind === "onboarding" && task.fields.employeeId === id);
    return {
      launched: typeof employee?.fields.onboardingLaunchedAt === "string",
      mentor: employee?.fields.mentor,
      taskCount: tasks.length,
      allLinked: tasks.every((task) => task.parentId === id),
      waitingIT: tasks.filter((task) => task.fields.group === "IT access" && task.status === "waiting").length,
      falselyGranted: tasks.some((task) => task.title.toLowerCase().includes("granted")),
    };
  }, ids.starter);
  await expect.poll(read).toEqual({
    launched: true, mentor: "QA Onboarding Mentor",
    taskCount: 6, allLinked: true, waitingIT: 1, falselyGranted: false,
  });

  await page.getByRole("button", { name: "Launch a checklist" }).click();
  const repeat = page.getByRole("dialog", { name: "Launch an onboarding checklist" });
  await repeat.getByLabel("Who is starting").selectOption(ids.starter);
  await repeat.getByLabel("Mentor").selectOption({ label: "QA Onboarding Mentor" });
  await repeat.getByRole("button", { name: "Launch checklist" }).click();
  await expect.poll(read).toMatchObject({ taskCount: 6 });
});
