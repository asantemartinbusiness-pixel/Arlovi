import { expect, test } from "@playwright/test";

test("AI execution preflight is explicitly blocked without secure infrastructure", async ({ page }) => {
  await page.goto("/o/northline/workspace/work");
  await expect(page.getByRole("heading",{name:"AI work assignments"})).toBeVisible();
  const selectorTask=page.getByRole("combobox",{name:"Task to assign"});
  const selectorAgent=page.getByRole("combobox",{name:"AI employee"});
  const taskValue=await selectorTask.locator("option:not([value=''])").first().getAttribute("value");
  const agentValue=await selectorAgent.locator("option:not([value=''])").first().getAttribute("value");
  test.skip(!taskValue || !agentValue,"Requires active AI employee and open task");
  await selectorTask.selectOption(taskValue!);
  await selectorAgent.selectOption(agentValue!);
  test.skip(await page.getByRole("button",{name:"Assign work"}).isDisabled(),"Task already has an active assignment");
  await page.getByRole("button",{name:"Assign work"}).click();
  const row=page.locator(".ws-agent-row").filter({hasText:"Not executing"}).first();
  await expect(row).toBeVisible();
  await row.getByRole("button",{name:"Check readiness"}).click();
  await expect(row.getByText("Preflight report")).toContainText("blockers");
  await expect(row.getByText("AUTH NOT CONFIGURED")).toBeVisible();
  await expect(row.getByText("PROVIDER NOT CONNECTED")).toBeVisible();
  await row.getByRole("button",{name:"Record execution request"}).click();
  await expect(row.getByText("Execution blocked;")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Execution blocked;")).toBeVisible();
  await page.getByRole("button",{name:"Dismiss blocked request"}).first().click();
  await expect(page.getByText("Execution blocked;")).toHaveCount(0);
});

test("AI execution request endpoint is not exposed as an unauthenticated runnable API", async ({ request }) => {
  // The SPA fallback may serve index.html for unknown paths. That is not a worker
  // and must never claim a successful execution or a provider receipt.
  const response = await request.post("/api/agent-execution",{data:{assignmentId:"attacker-controlled"}});
  expect(response.status()).not.toBe(200);
});
