import { expect, test } from "@playwright/test";

test("Performance review modal has three evidence steps and refuses unsupported ratings", async ({ page }) => {
  await page.goto("/o/northline/hr/performance?tab=Cycles");
  const action = page.locator("#main").getByRole("button", { name: "Create a review" }).first();
  await expect(action).toBeVisible();
  await action.click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Create an evidence-led review" })).toBeVisible();
  await expect(modal.locator(".hr-dialog-section")).toHaveCount(3);
  await modal.locator("select[name='employee']").selectOption({ index: 1 });
  await modal.locator("select[name='rating']").selectOption("meeting");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(modal).toContainText("A rating needs at least 20 characters");
  await modal.locator("textarea[name='evidence']").fill(
    "The documented work met the agreed criteria, with project delivery evidence reviewed by a person.");
  await page.getByRole("button", { name: "Save review" }).click();
  await expect(modal).toHaveCount(0);
  const created = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const records = await repo.listByCollection("org-northline", "reviews");
    return records.filter((row) => row.summary.startsWith("The documented work met the agreed criteria"))
      .map((row) => ({ status: row.status, reviewer: row.fields.reviewer, aiAssisted: row.fields.aiAssisted }));
  });
  expect(created).toContainEqual({ status: "draft", reviewer: "Maya Chen", aiAssisted: false });
});

test("Course builder saves a validated local draft, not a fabricated published lesson", async ({ page }) => {
  await page.goto("/o/northline/hr/learning?tab=Courses");
  await page.locator("#main").getByRole("button", { name: "Create course" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Build a new learning record" })).toBeVisible();
  await expect(modal.locator(".hr-dialog-section")).toHaveCount(3);
  await modal.locator("input[name='title']").fill("QA Evidence Handling Course");
  await modal.locator("input[name='minutes']").fill("0");
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(modal).toContainText("Estimated duration must be a whole number");
  await modal.locator("input[name='minutes']").fill("35");
  await page.getByRole("button", { name: "Save course" }).click();
  await expect(modal).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    return (await repo.listByCollection("org-northline", "courses"))
      .filter((row) => row.title === "QA Evidence Handling Course")
      .map((row) => ({ status: row.status, minutes: row.fields.minutes, completions: row.fields.completions }));
  });
  expect(saved).toContainEqual({ status: "draft", minutes: 35, completions: undefined });
});

test("Quiz remains an interactive preview and makes no completion claim", async ({ page }) => {
  await page.goto("/o/northline/hr/learning?tab=Courses");
  await page.locator("#main").getByRole("button", { name: "Preview quiz" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Preview the knowledge check" })).toBeVisible();
  const button = modal.getByRole("button", { name: "Check preview answers" });
  await expect(button).toBeDisabled();
  await modal.locator(".hr-dialog-section select").nth(0).selectOption("named-approver");
  await modal.locator(".hr-dialog-section select").nth(1).selectOption("human-draft");
  await button.click();
  await expect(modal).toContainText("Both sample answers are correct");
  await expect(modal).toContainText("No completion is recorded");
});

test("Policy revision requires changed wording, a reason and human confirmation", async ({ page }) => {
  await page.goto("/o/northline/hr/learning?tab=Policies");
  const action = page.locator("#main").getByRole("button", { name: "Review revision" }).first();
  await expect(action).toBeVisible();
  await action.click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Publish a reviewed record revision" })).toBeVisible();
  const publish = modal.getByRole("button", { name: /Publish version/ });
  await expect(publish).toBeDisabled();
  await modal.locator("textarea").nth(0).fill(
    "Updated QA policy summary: all employees should read the latest security and access handling instructions.");
  await modal.locator("textarea").nth(1).fill(
    "The revision clarifies the responsibilities of the named access approver.");
  await expect(publish).toBeDisabled();
  await modal.getByRole("checkbox").check();
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(modal).toHaveCount(0);
  const versioned = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    return (await repo.listByCollection("org-northline", "policies"))
      .filter((row) => row.summary.startsWith("Updated QA policy summary"))
      .map((row) => ({
        version: row.fields.version, count: row.fields.acknowledged,
        previous: row.history[0]?.summary, reason: row.fields.revisionReason,
      }));
  });
  expect(versioned.length).toBe(1);
  expect(versioned[0].count).toBe(0);
  expect(versioned[0].previous).toBeTruthy();
  expect(versioned[0].reason).toContain("named access approver");
});

test("Policy acknowledgement preserves one version-specific record and matching aggregate", async ({ page }) => {
  await page.goto("/o/northline/hr/learning?tab=Policies");
  const id = await page.evaluate(async () => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const now = new Date().toISOString();
    const policy = repo.newRecord({
      organizationId: "org-northline", currency: "GBP", collection: "policies",
      title: "QA Atomic Policy Acknowledgement", status: "published",
      summary: "Policy acknowledgement consistency test",
      fields: { kind: "hr", version: "1.0", acknowledged: 0, acknowledgementRequired: true },
    }, { actor: "Maya Chen", now });
    await repo.putMany([policy], { actor: "Maya Chen", now }, [], "org-northline");
    return policy.id;
  });
  await page.reload();
  const card = page.locator("#main .ds-card").filter({ hasText: "QA Atomic Policy Acknowledgement" }).first();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Acknowledge", exact: true }).click();
  const read = async () => page.evaluate(async (policyId) => {
    const path = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ path) as typeof import("../src/platform/repo");
    const policy = await repo.getRecord(policyId);
    const linked = (await repo.listChildren("org-northline", policyId))
      .filter((entry) => entry.collection === "acknowledgements" && entry.fields.version === "1.0");
    return { aggregate: policy?.fields.acknowledged, linked: linked.length };
  }, id);
  await expect.poll(read).toEqual({ aggregate: 1, linked: 1 });
  await card.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(page.getByText("Already acknowledged").first()).toBeVisible();
  expect(await read()).toEqual({ aggregate: 1, linked: 1 });
});


test("Offboarding requires a reason and human confirmation and never claims external revocation", async ({ page }) => {
  await page.goto("/o/northline/hr/employees");
  const employeeId = await page.evaluate(async () => {
    const repo = await import("../src/platform/repo");
    const rows = await repo.listByCollection("org-northline", "employees");
    return rows.find((row) => row.status !== "alumni")?.id ?? null;
  });
  expect(employeeId).toBeTruthy();
  await page.goto(`/o/northline/hr/employees/${employeeId}`);
  await page.locator("#main").getByRole("button", { name: "Offboard" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Record a departure" })).toBeVisible();
  await expect(modal.locator(".hr-dialog-section")).toHaveCount(3);
  await expect(modal).toContainText("External access is not revoked");
  const save = modal.getByRole("button", { name: "Record departure" });
  await expect(save).toBeDisabled();
  await modal.getByRole("textbox", { name: "Reason for offboarding" }).fill("Approved departure after handover review.");
  await expect(save).toBeDisabled();
  const checks = modal.getByRole("checkbox");
  await expect(checks).toHaveCount(3);
  await checks.nth(0).check();
  await checks.nth(1).check();
  await expect(save).toBeDisabled();
  await checks.nth(2).check();
  await expect(save).toBeEnabled();
});


test("Employee intake is a three-step local record workflow and does not claim an invitation", async ({ page }) => {
  await page.goto("/o/northline/hr/employees?tab=People");
  await page.locator("#main").getByRole("button", { name: "Invite someone" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Create an employee record" })).toBeVisible();
  await expect(modal.locator(".hr-dialog-section")).toHaveCount(3);
  await expect(modal).toContainText("No connected delivery or identity provisioning");
  await expect(modal).toContainText("Not invited");
  await modal.locator('input[name="name"]').fill("QA Intake Person");
  await modal.locator('input[name="email"]').fill("qa-intake@example.test");
  await modal.getByRole("button", { name: "Create employee record" }).click();
  await expect(modal).toHaveCount(0);
  const created = await page.evaluate(async () => {
    const repo = await import("../src/platform/repo");
    return (await repo.listByCollection("org-northline", "employees"))
      .filter((row) => row.title === "QA Intake Person")
      .map((row) => ({ invitationStatus: row.fields.invitationStatus, office: row.fields.office, summary: row.summary }));
  });
  expect(created).toEqual([{ invitationStatus: "not_sent", office: "", summary: expect.stringContaining("No invitation has been sent") }]);
});


test("Leave request presents identity, dates, balance and conflict review", async ({ page }) => {
  await page.goto("/o/northline/hr/leave?tab=My%20leave");
  await page.locator("#main").getByRole("button", { name: "Request leave" }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByRole("heading", { name: "Request time away" })).toBeVisible();
  await expect(modal.locator(".hr-dialog-section")).toHaveCount(3);
  await expect(modal).toContainText("Recorded balance and conflicts");
  await expect(modal).toContainText("A submitted request does not reserve time");
});

test("Timesheets offer a dedicated approval-mismatch filter", async ({ page }) => {
  await page.goto("/o/northline/hr/scheduling?tab=Timesheets");
  const filter = page.locator("#main").getByRole("button", { name: /Review mismatches/ });
  await expect(filter).toBeVisible();
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
});

test("Leave decision requires an explicit reviewer acknowledgement", async ({ page }) => {
  await page.goto("/o/northline/hr/leave?tab=Approvals");
  const review = page.locator("#main").getByRole("button", { name: "Review decision" }).first();
  await expect(review).toBeVisible();
  await review.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "Review a leave request" })).toBeVisible();
  await expect(drawer.locator(".hr-dialog-section")).toHaveCount(3);
  const approve = drawer.getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeDisabled();
  await drawer.getByRole("checkbox", { name: /reviewed this request/ }).check();
  await expect(approve).toBeEnabled();
});
