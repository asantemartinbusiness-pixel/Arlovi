import { expect, test } from "@playwright/test";

test("a document cannot publish with unresolved mandatory reviews or tracked changes", async ({ page }) => {
  await page.goto("/o/northline/docs/files");
  const id = await page.evaluate(async () => {
    const repoPath = "/src/platform/repo.ts";
    const modelPath = "/src/applications/docs/model.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const docs = await import(/* @vite-ignore */ modelPath) as typeof import("../src/applications/docs/model");
    const ctx = { actor: "Maya Chen", now: new Date().toISOString() };
    const body = docs.emptyDoc();
    body.comments.push({
      id: "qa-mandatory", anchor: { blockId: body.blocks[0].id, start: 0, end: 0 },
      quote: "", author: "QA Reviewer", at: ctx.now, body: "Check the terms",
      resolved: false, mandatory: true, replies: [],
    });
    body.suggestions.push({
      id: "qa-suggestion", kind: "insert", author: "QA Reviewer", at: ctx.now,
      note: "Review a phrase", status: "open",
    });
    const record = repo.newRecord({
      organizationId: "org-northline", collection: "documents", currency: "GBP",
      title: "QA Publication Gate", status: "draft", body,
      fields: { folder: "QA", confidential: false },
    }, ctx);
    await repo.putRecord(record, ctx);
    return record.id;
  });
  await page.goto(`/o/northline/docs/documents/${id}/publish`);
  await page.getByRole("tab", { name: "Publish", exact: true }).click();
  const main = page.locator("#main");
  const review = main.getByRole("button", { name: "Review and publish…" });
  await expect(review).toBeDisabled();
  await expect(main).toContainText("Open comments");
  await expect(main).toContainText("Open changes");
  await expect(main).toContainText("Resolve mandatory comments and decide tracked changes");

  await page.evaluate(async (recordId) => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    const record = await repo.getRecord(recordId);
    if (!record) throw new Error("QA document missing");
    const body = record.body as {
      comments: { resolved: boolean }[];
      suggestions: { status: "open" | "accepted" | "rejected" }[];
    };
    const next = {
      ...body,
      comments: body.comments.map((comment) => ({ ...comment, resolved: true })),
      suggestions: body.suggestions.map((suggestion) => ({ ...suggestion, status: "accepted" as const })),
    };
    await repo.patchRecord(record.id, { body: next }, {
      actor: "QA Reviewer", now: new Date().toISOString(),
    }, { expectRevision: record.revision });
  }, id);
  await page.reload();
  await page.getByRole("tab", { name: "Publish", exact: true }).click();
  await expect(review).toBeEnabled();
  await review.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Approve and publish locally" })).toBeVisible();
  await expect(dialog).toContainText("Approver");
  await dialog.getByRole("checkbox", { name: /reviewed this version and confirm/ }).check();
  await dialog.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(async () => page.evaluate(async (recordId) => {
    const repoPath = "/src/platform/repo.ts";
    const repo = await import(/* @vite-ignore */ repoPath) as typeof import("../src/platform/repo");
    return (await repo.getRecord(recordId))?.status;
  }, id)).toBe("published");
});
