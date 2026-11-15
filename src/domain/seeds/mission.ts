import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";

/* ------------------------------------------------------------------ *
 * Mission fixtures: plans with dependencies, steps the local interpreter can
 * actually run, receipts for what it did, and a budget that separates
 * committed headroom from money that has actually left the ledger (none).
 * ------------------------------------------------------------------ */

registerSeed("mission", (ctx) => {
  const at = (days: number, hours = 0) =>
    new Date(new Date(ctx.now).getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();
  const day = (days: number) => at(days).slice(0, 10);

  const mission = (n: number, title: string, input: {
    status: string;
    summary: string;
    owner: string;
    agentId: string;
    budgetMinor: number;
    committedMinor: number;
    spentMinor: number;
    dueDays?: number;
    criteria: { id: string; label: string; verified: boolean; evidenceId?: string }[];
    targetId?: string;
    departmentId?: string;
    planVersion?: number;
    objectiveId?: string;
  }) => ctx.rec({
    org: "nl", collection: "missions", n, title, status: input.status, owner: input.owner,
    summary: input.summary, at: at(-6), dueAt: input.dueDays === undefined ? undefined : at(input.dueDays),
    amountMinor: input.budgetMinor,
    fields: {
      agentId: input.agentId,
      budgetMinor: input.budgetMinor,
      committedMinor: input.committedMinor,
      spentMinor: input.spentMinor,
      targetId: input.targetId ?? "",
      departmentId: input.departmentId ?? "nl-departments-001",
      planVersion: input.planVersion ?? 1,
      objectiveId: input.objectiveId ?? "",
      executionPaused: false,
    },
    body: { criteria: input.criteria },
  });

  const task = (n: number, title: string, input: {
    missionN: number;
    stage: "todo" | "ready" | "running" | "review" | "blocked" | "verified";
    summary: string;
    assignee: string;
    kind: "ai" | "human";
    estimateHours: number;
    dependsOn?: number[];
    approvalRequired?: boolean;
    evidence?: string[];
    order: number;
    risk?: string;
  }) => ctx.rec({
    org: "nl", collection: "missionTasks", n, title,
    status: input.stage === "verified" ? "done" : input.stage,
    parentId: `nl-missions-${String(input.missionN).padStart(3, "0")}`,
    summary: input.summary, owner: input.assignee,
    fields: {
      stage: input.stage,
      assignee: input.assignee,
      kind: input.kind,
      estimateHours: input.estimateHours,
      approvalRequired: input.approvalRequired ?? false,
      order: input.order,
      risk: input.risk ?? "",
    },
    body: {
      dependsOn: (input.dependsOn ?? []).map((item) => `nl-missionTasks-${String(item).padStart(3, "0")}`),
      evidence: input.evidence ?? [],
    },
  });

  const step = (n: number, title: string, input: {
    missionN: number;
    order: number;
    kind: "read" | "compute" | "draft" | "approval" | "provider";
    state: "done" | "ready" | "blocked" | "awaiting_approval" | "failed" | "unknown_side_effect";
    summary: string;
    capability?: string;
    attempts?: number;
    taskId?: string;
    operation: string;
    output?: string;
    reason?: string;
  }) => ctx.rec({
    org: "nl", collection: "missionSteps", n, title,
    status: input.state,
    parentId: `nl-missions-${String(input.missionN).padStart(3, "0")}`,
    summary: input.summary, owner: "Nia Okonkwo", at: at(-1, input.order),
    fields: {
      order: input.order,
      kind: input.kind,
      capability: input.capability ?? "",
      attempts: input.attempts ?? (input.state === "done" ? 1 : 0),
      taskId: input.taskId ?? "",
      operation: input.operation,
    },
    body: { output: input.output ?? "", reason: input.reason ?? "", inputs: [] },
  });

  const records: Rec[] = [
    mission(20, "Second brass supplier", {
      status: "proposed", owner: "Maya Chen", agentId: "nl-agents-061",
      summary: "Qualify one more collar supplier before the winter run, from recorded terms only.",
      budgetMinor: 80_000, committedMinor: 0, spentMinor: 0, dueDays: 21,
      targetId: "nl-suppliers-001", departmentId: "nl-departments-001", objectiveId: "nl-objectives-001",
      criteria: [
        { id: "c1", label: "Two suppliers recorded with comparable terms", verified: false },
        { id: "c2", label: "Risk register updated with the result", verified: false },
      ],
    }),
    mission(21, "Shade warranty replies", {
      status: "waiting", owner: "Priya Shah", agentId: "nl-agents-004",
      summary: "Draft replies for every open shade ticket using the approved articles. Waiting on a person to approve the wording.",
      budgetMinor: 30_000, committedMinor: 12_000, spentMinor: 0, dueDays: 4,
      targetId: "nl-contacts-001", departmentId: "nl-departments-002",
      criteria: [
        { id: "c1", label: "Every open ticket has a drafted reply", verified: true, evidenceId: "nl-tickets-001" },
        { id: "c2", label: "A person approved each draft before it is used", verified: false },
      ],
    }),
    mission(22, "Autumn pricing review", {
      status: "completed", owner: "Maya Chen", agentId: "nl-agents-064",
      summary: "Checked recorded prices against the price list and the paid invoices. Closed with two corrections.",
      budgetMinor: 50_000, committedMinor: 50_000, spentMinor: 0, dueDays: -12,
      targetId: "", departmentId: "nl-departments-002",
      criteria: [
        { id: "c1", label: "Every product price cites a source", verified: true, evidenceId: "nl-sources-060" },
        { id: "c2", label: "Corrections recorded in the fact registry", verified: true, evidenceId: "nl-facts-071" },
      ],
    }),
    mission(23, "Showroom hours correction", {
      status: "running", owner: "Priya Shah", agentId: "nl-agents-001",
      summary: "Settle the Saturday closing time and update every place it appears.",
      budgetMinor: 20_000, committedMinor: 8_000, spentMinor: 0, dueDays: 2,
      departmentId: "nl-departments-002",
      criteria: [
        { id: "c1", label: "Conflict resolved with a chosen source", verified: false },
        { id: "c2", label: "Location record and public page agree", verified: false },
      ],
    }),
    mission(24, "Spring catalogue groundwork", {
      status: "archived", owner: "Maya Chen", agentId: "nl-agents-003",
      summary: "Archived before the plan was approved. Kept for audit; it cannot be executed.",
      budgetMinor: 0, committedMinor: 0, spentMinor: 0,
      departmentId: "nl-departments-001",
      criteria: [{ id: "c1", label: "Plan approved", verified: false }],
    }),

    task(20, "Read the supply agreement terms", { missionN: 60, stage: "verified", order: 1, summary: "Payment terms and the sole-source clause.", assignee: "Tomas Reiner", kind: "ai", estimateHours: 1, evidence: ["nl-sources-063"] }),
    task(21, "List candidate suppliers already recorded", { missionN: 60, stage: "ready", order: 2, summary: "Only one supplier record exists, so the gap is reported rather than filled.", assignee: "Tomas Reiner", kind: "ai", estimateHours: 1, dependsOn: [60], risk: "No supplier directory is reachable from this browser." }),
    task(22, "Enter a second supplier record", { missionN: 60, stage: "todo", order: 3, summary: "A person must add the supplier before terms can be compared.", assignee: "Maya Chen", kind: "human", estimateHours: 2, dependsOn: [61] }),
    task(23, "Compare terms and write the note", { missionN: 60, stage: "todo", order: 4, summary: "Comparison from recorded terms only.", assignee: "Tomas Reiner", kind: "ai", estimateHours: 2, dependsOn: [62] }),
    task(24, "Approve the recommendation", { missionN: 60, stage: "todo", order: 5, summary: "Owner decision; the mission stops here until it is given.", assignee: "Maya Chen", kind: "human", estimateHours: 1, dependsOn: [63], approvalRequired: true }),

    task(30, "Collect open shade tickets", { missionN: 61, stage: "verified", order: 1, summary: "One open ticket found.", assignee: "Remy Alves", kind: "ai", estimateHours: 1, evidence: ["nl-tickets-001"] }),
    task(31, "Draft each reply from approved articles", { missionN: 61, stage: "review", order: 2, summary: "Draft written with the warranty article cited.", assignee: "Remy Alves", kind: "ai", estimateHours: 1, dependsOn: [70], evidence: ["nl-sources-067"] }),
    task(32, "Approve the wording", { missionN: 61, stage: "blocked", order: 3, summary: "Waiting on Priya. Nothing can be sent in any case: no mail provider is connected.", assignee: "Priya Shah", kind: "human", estimateHours: 1, dependsOn: [71], approvalRequired: true, risk: "Sending is not possible from this browser." }),

    task(40, "Read both hour sources", { missionN: 63, stage: "verified", order: 1, summary: "Board photograph and the location record.", assignee: "Nia Okonkwo", kind: "ai", estimateHours: 1, evidence: ["nl-sources-061"] }),
    task(41, "Choose the source of truth", { missionN: 63, stage: "running", order: 2, summary: "A person must choose; the conflict is in the knowledge board.", assignee: "Priya Shah", kind: "human", estimateHours: 1, dependsOn: [80], approvalRequired: true }),
    task(42, "Update the location record", { missionN: 63, stage: "ready", order: 3, summary: "Local record edit once the choice is made.", assignee: "Priya Shah", kind: "human", estimateHours: 1, dependsOn: [81] }),
    task(43, "Update the public page", { missionN: 63, stage: "blocked", order: 4, summary: "The saved page cannot be republished: no hosting connection exists.", assignee: "Nia Okonkwo", kind: "ai", estimateHours: 1, dependsOn: [82], risk: "Publishing is not connected." }),

    task(50, "Check every product price against the list", { missionN: 62, stage: "verified", order: 1, summary: "Three products checked.", assignee: "Pilar Sainz", kind: "ai", estimateHours: 2, evidence: ["nl-sources-060"] }),
    task(51, "Record the two corrections", { missionN: 62, stage: "verified", order: 2, summary: "Collar spare and pendant trio corrected in the registry.", assignee: "Pilar Sainz", kind: "ai", estimateHours: 1, dependsOn: [90], evidence: ["nl-facts-071"] }),
    task(52, "Owner sign-off", { missionN: 62, stage: "verified", order: 3, summary: "Signed off by Maya.", assignee: "Maya Chen", kind: "human", estimateHours: 1, dependsOn: [91], approvalRequired: true }),

    step(20, "Read the winter run product records", { missionN: 1, order: 1, kind: "read", state: "done", summary: "Read the products and their recorded prices.", operation: "collect.products", output: "3 product records read, each with a recorded ex-VAT price.", taskId: "nl-missionTasks-001" }),
    step(21, "Collect the open invoice position", { missionN: 1, order: 2, kind: "read", state: "done", summary: "Open invoices with due dates.", operation: "collect.open_invoices", output: "Open invoices listed with due dates and amounts.", taskId: "nl-missionTasks-001" }),
    step(22, "Compute the launch budget headroom", { missionN: 1, order: 3, kind: "compute", state: "done", summary: "Budget minus committed.", operation: "compute.budget_headroom", output: "Headroom computed from the mission budget and its commitments." }),
    step(23, "Draft the campaign copy", { missionN: 1, order: 4, kind: "draft", state: "ready", summary: "Writes a draft document record from the product and decision records.", operation: "draft.campaign_copy" }),
    step(24, "Owner approves the copy", { missionN: 1, order: 5, kind: "approval", state: "awaiting_approval", summary: "Held for an owner or an approver. Nothing proceeds without it.", operation: "approval.owner" }),
    step(25, "Email the trade list", { missionN: 1, order: 6, kind: "provider", state: "blocked", capability: "email.send", summary: "Stopped at the provider boundary.", operation: "provider.email_send", reason: "No mail provider is connected. The recipient list and body are kept as a local draft and nothing was sent." }),
    step(26, "Publish the launch page", { missionN: 1, order: 7, kind: "provider", state: "blocked", capability: "site.publish", summary: "Stopped at the provider boundary.", operation: "provider.site_publish", reason: "No hosting connection exists, so the page model stays in this workspace." }),
    step(27, "Fetch the supplier price feed", { missionN: 1, order: 8, kind: "provider", state: "unknown_side_effect", capability: "bank.feed", attempts: 2, summary: "An earlier attempt ended without a reply, so the outcome is unknown.", operation: "provider.price_feed", reason: "The attempt was recorded with no response. Retrying could repeat an effect that may already have happened, so it must be reconciled by a person first." }),

    ctx.rec({
      org: "nl", collection: "missionReceipts", n: 60, title: "Receipt · collect.open_invoices",
      status: "recorded", parentId: "nl-missions-001", at: at(-1, 2),
      summary: "Local read. Inputs, output and the records read are all recorded.",
      fields: { stepId: "nl-missionSteps-061", state: "ready_local", attempt: 1, actor: "Nia Okonkwo" },
      body: { request: "List invoices where status is not paid, void or draft.", response: "Open invoices with due dates and amounts.", read: ["nl-invoices-001"], reason: "" },
    }),
    ctx.rec({
      org: "nl", collection: "missionReceipts", n: 61, title: "Receipt · provider.email_send",
      status: "blocked", parentId: "nl-missions-001", at: at(-1, 6),
      summary: "Nothing was sent. The request body is kept locally with the reason.",
      fields: { stepId: "nl-missionSteps-065", state: "not_connected", attempt: 1, actor: "Nia Okonkwo", capability: "email.send" },
      body: { request: "Send the launch note to the trade list.", response: "", reason: "No mail provider is connected. Nothing left this browser.", read: [] },
    }),
    ctx.rec({
      org: "nl", collection: "missionReceipts", n: 62, title: "Receipt · provider.price_feed",
      status: "failed", parentId: "nl-missions-001", at: at(-1, 8),
      summary: "No response was recorded, so the side effect is unknown.",
      fields: { stepId: "nl-missionSteps-067", state: "failed", attempt: 2, actor: "Nia Okonkwo", capability: "bank.feed" },
      body: { request: "Request the supplier price feed.", response: "", reason: "The attempt ended with no recorded response. Reconcile before any retry.", read: [] },
    }),

    ctx.rec({
      org: "nl", collection: "missionCosts", n: 60, title: "Commitment · photography slot",
      status: "committed", parentId: "nl-missions-001", at: at(-4), amountMinor: 60_000,
      summary: "Reserved against the mission ceiling. No money has left the ledger.",
      fields: { kind: "commitment", missionId: "nl-missions-001", source: "Mission plan", approvedBy: "Maya Chen" },
    }),
    ctx.rec({
      org: "nl", collection: "missionCosts", n: 61, title: "Commitment · collar batch",
      status: "committed", parentId: "nl-missions-001", at: at(-3), amountMinor: 45_000,
      summary: "Reserved for the winter run collars.",
      fields: { kind: "commitment", missionId: "nl-missions-001", source: "Mission plan", approvedBy: "Maya Chen" },
    }),
    ctx.rec({
      org: "nl", collection: "missionCosts", n: 62, title: "Provider cost · model inference",
      status: "not_incurred", parentId: "nl-missions-001", at: at(-1), amountMinor: 0,
      summary: "No model provider is connected, so no inference cost exists to record.",
      fields: { kind: "provider", missionId: "nl-missions-001", source: "Model provider", capability: "not_connected" },
    }),
    ctx.rec({
      org: "nl", collection: "missionCosts", n: 63, title: "Commitment · care drafting time",
      status: "committed", parentId: "nl-missions-061", at: at(-2), amountMinor: 12_000,
      summary: "Reserved against the warranty replies mission.",
      fields: { kind: "commitment", missionId: "nl-missions-061", source: "Mission plan", approvedBy: "Priya Shah" },
    }),

    ctx.rec({
      org: "nl", collection: "documents", n: 70, title: "Winter launch campaign copy",
      status: "review", parentId: "nl-missions-001", owner: "Sable Nguyen", at: at(-1),
      summary: "Deliverable drafted from the product and decision records.",
      fields: { missionId: "nl-missions-001", deliverable: true, version: 2, approval: "in_review", reviewer: "Maya Chen" },
      body: {
        text: "Winter trade launch — copy\n\nThe winter run is open for trade orders. Prices are shown excluding VAT, as the pricing decision requires. Lead times come from the production notes, not from the saved web page.",
        versions: [
          { version: 1, at: at(-2), author: "Sable Nguyen", summary: "First draft." },
          { version: 2, at: at(-1), author: "Sable Nguyen", summary: "Removed the four-week lead time taken from the expired page." },
        ],
      },
    }),
    ctx.rec({
      org: "nl", collection: "documents", n: 71, title: "Winter launch photography brief",
      status: "approved", parentId: "nl-missions-001", owner: "Sable Nguyen", at: at(-2),
      summary: "Approved deliverable. Nothing has been published anywhere.",
      fields: { missionId: "nl-missions-001", deliverable: true, version: 1, approval: "approved", approvedBy: "Maya Chen" },
      body: { text: "Three products, warm glaze, bench setting. Shot list taken from the product records." },
    }),
    ctx.rec({
      org: "nl", collection: "documents", n: 72, title: "Autumn pricing review report",
      status: "published", parentId: "nl-missions-062", owner: "Pilar Sainz", at: at(-12),
      summary: "Published inside this workspace: two corrections and their sources.",
      fields: { missionId: "nl-missions-062", deliverable: true, version: 3, approval: "published", approvedBy: "Maya Chen", publishedScope: "workspace" },
      body: { text: "Two corrections were recorded. Both cite the November price list. No external publication took place." },
    }),
    ctx.rec({
      org: "nl", collection: "documents", n: 73, title: "Supplier comparison note",
      status: "draft", parentId: "nl-missions-060", owner: "Tomas Reiner", at: at(-1),
      summary: "Draft deliverable. It reports that only one supplier is recorded.",
      fields: { missionId: "nl-missions-060", deliverable: true, version: 1, approval: "draft" },
      body: { text: "One supplier is recorded: Thames Brass, 30-day terms, collar price fixed for six months. A comparison needs a second supplier record." },
    }),

    ctx.rec({
      org: "nl", collection: "templates", n: 60, title: "Quarterly pricing review",
      status: "published", owner: "Maya Chen",
      summary: "Read prices, check sources, record corrections, sign off. Built from the completed autumn review.",
      fields: { kind: "mission", origin: "company", steps: 4, builtFrom: "nl-missions-062", lastUsed: day(-12) },
      body: {
        steps: [
          { title: "Read every product price", kind: "read" },
          { title: "Check each price against its source", kind: "compute" },
          { title: "Record corrections", kind: "draft" },
          { title: "Owner sign-off", kind: "approval" },
        ],
        team: ["nl-agents-064"],
        grants: ["workspace.read"],
        note: "No credential or approval is carried forward: the grants list is tools only.",
      },
    }),
    ctx.rec({
      org: "nl", collection: "templates", n: 61, title: "Supplier qualification",
      status: "published", owner: "Maya Chen",
      summary: "Industry shape for qualifying a second supplier from recorded terms.",
      fields: { kind: "mission", origin: "industry", steps: 5, lastUsed: "" },
      body: {
        steps: [
          { title: "Read current agreement terms", kind: "read" },
          { title: "List recorded candidates", kind: "read" },
          { title: "Enter missing supplier records", kind: "draft" },
          { title: "Compare terms", kind: "compute" },
          { title: "Owner approval", kind: "approval" },
        ],
        team: ["nl-agents-061"],
        grants: ["workspace.read", "workspace.draft"],
        note: "Contains no supplier contacts: a template never carries an account or a credential.",
      },
    }),
    ctx.rec({
      org: "nl", collection: "templates", n: 62, title: "Care reply sweep",
      status: "draft", owner: "Priya Shah",
      summary: "My own shape for clearing open tickets with approved wording.",
      fields: { kind: "mission", origin: "mine", steps: 3, lastUsed: day(-4) },
      body: {
        steps: [
          { title: "Collect open tickets", kind: "read" },
          { title: "Draft replies from approved articles", kind: "draft" },
          { title: "Person approves each draft", kind: "approval" },
        ],
        team: ["nl-agents-004"],
        grants: ["workspace.read"],
        note: "Sending is deliberately not a step: no mail provider is connected.",
      },
    }),
  ];

  return {
    records,
    events: [
      {
        id: "evt-mission-20",
        organizationId: ctx.northline,
        at: at(-1, 6),
        actor: "Nia Okonkwo",
        type: "mission.step_blocked",
        message: "Email the trade list stopped at the provider boundary: no mail provider is connected.",
        entityId: "nl-missions-001",
        capability: "not_connected",
      },
      {
        id: "evt-mission-21",
        organizationId: ctx.northline,
        at: at(-1, 8),
        actor: "Nia Okonkwo",
        type: "mission.step_unknown",
        message: "Fetch the supplier price feed ended with no recorded response and must be reconciled before any retry.",
        entityId: "nl-missions-001",
        capability: "failed",
      },
    ],
  };
});
