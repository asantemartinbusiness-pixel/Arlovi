import { registerSeed } from "@/domain/seedRegistry";

/**
 * AUTO fixtures. Two further automations with real graphs, one run that stopped
 * at an approval gate and one that stopped at the provider boundary, plus the
 * exception raised from it. Ids start at n: 20 so nothing collides with the
 * base seed.
 */
registerSeed("auto", (ctx) => {
  const chaseGraph = {
    nodes: [
      { id: "n1", type: "trigger", label: "Overdue invoice", x: 30, y: 150, config: { collection: "invoices", event: "record.overdue", timezone: "Europe/London", filters: [{ field: "record.status", op: "neq", value: "paid" }] } },
      { id: "n2", type: "set", label: "Total at risk", x: 230, y: 150, config: { name: "atRisk", expr: "sum(trigger.matched.amountMinor)" } },
      { id: "n3", type: "condition", label: "Older than 7 days", x: 430, y: 150, config: { left: "overdueDays", op: "gt", right: "7" } },
      { id: "n4", type: "approval", label: "Finance approves the chase", x: 630, y: 40, config: { approvers: "Jonah Adeyemi" } },
      { id: "n5", type: "action", label: "Draft the chase letter", x: 830, y: 40, config: { kind: "record.create", target: "messages", titleExpr: "Chase {record.title}", summaryExpr: "{record.title} is {overdueDays} days overdue. {atRisk} minor units are at risk in total.", retries: 0, onError: "halt", impact: "low" } },
      { id: "n6", type: "action", label: "Email the customer", x: 830, y: 200, config: { kind: "provider.call", capability: "email.send", impact: "high", retries: 2, onError: "halt", sensitive: true } },
      { id: "n7", type: "action", label: "Note that no chase was needed", x: 630, y: 280, config: { kind: "log.note", summaryExpr: "{record.title} is only {overdueDays} days past due, so no chase was drafted.", retries: 0, onError: "halt", impact: "low" } },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", port: "out" },
      { id: "e2", from: "n2", to: "n3", port: "out" },
      { id: "e3", from: "n3", to: "n4", port: "then" },
      { id: "e4", from: "n3", to: "n7", port: "else" },
      { id: "e5", from: "n4", to: "n5", port: "approved" },
      { id: "e6", from: "n5", to: "n6", port: "out" },
    ],
    limits: { maxSteps: 40, maxVisits: 3 },
    assertions: [
      { id: "a1", nodeId: "n1", subject: "status", op: "eq", value: "ok" },
      { id: "a2", nodeId: "n6", subject: "status", op: "eq", value: "blocked" },
    ],
  };

  const triageGraph = {
    nodes: [
      { id: "n1", type: "trigger", label: "New support ticket", x: 40, y: 120, config: { collection: "tickets", event: "record.matches", timezone: "Europe/London" } },
      { id: "n2", type: "condition", label: "High priority", x: 280, y: 120, config: { left: "record.priority", op: "eq", right: "high" } },
      { id: "n3", type: "action", label: "Tag for same-day reply", x: 520, y: 40, config: { kind: "record.tag", tag: "same-day", retries: 1, onError: "continue", impact: "low" } },
      { id: "n4", type: "action", label: "Log the normal path", x: 520, y: 220, config: { kind: "log.note", summaryExpr: "{record.title} stays on the standard queue.", retries: 0, onError: "halt", impact: "low" } },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", port: "out" },
      { id: "e2", from: "n2", to: "n3", port: "then" },
      { id: "e3", from: "n2", to: "n4", port: "else" },
    ],
    limits: { maxSteps: 25, maxVisits: 2 },
  };

  const looseGraph = {
    nodes: [
      { id: "n1", type: "trigger", label: "Weekly stock check", x: 40, y: 100, config: { collection: "products", event: "schedule", timezone: "Europe/London" } },
      { id: "n2", type: "set", label: "Units on hand", x: 280, y: 100, config: { name: "onHand", expr: "sum(trigger.matched.onHand)" } },
      { id: "n3", type: "condition", label: "Below the reorder point", x: 520, y: 100, config: { left: "onHand", op: "lt", right: "40" } },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", port: "out" },
      { id: "e2", from: "n2", to: "n3", port: "out" },
    ],
    limits: { maxSteps: 20, maxVisits: 2 },
  };

  return {
    records: [
      ctx.rec({
        org: "nl", collection: "workflows", n: 20, title: "Chase overdue invoices",
        status: "active", owner: "Jonah Adeyemi",
        summary: "Drafts a chase letter for an invoice more than seven days overdue, after finance approves. The email step has no provider and stops at the boundary.",
        body: chaseGraph,
        fields: { scheduleFrequency: "weekly", scheduleHour: 9, scheduleMinute: 15, scheduleWeekday: 1, scheduleTimezone: "Europe/London", concurrency: 1, webhookPath: "/hooks/nl-workflows-020" },
      }),
      ctx.rec({
        org: "nl", collection: "workflows", n: 21, title: "Triage new support tickets",
        status: "active", owner: "Priya Shah",
        summary: "Tags a high-priority ticket for a same-day reply and logs the normal path for everything else.",
        body: triageGraph,
        fields: { scheduleFrequency: "daily", scheduleHour: 8, scheduleMinute: 45, scheduleTimezone: "Europe/London", concurrency: 2 },
      }),
      ctx.rec({
        org: "nl", collection: "workflows", n: 22, title: "Weekly stock check",
        status: "draft", owner: "Maya Chen",
        summary: "Adds up units on hand and tests the reorder point. The true branch is not connected yet, so validation reports it.",
        body: looseGraph,
        fields: { scheduleFrequency: "weekly", scheduleHour: 7, scheduleMinute: 30, scheduleWeekday: 5, scheduleTimezone: "Europe/London", concurrency: 1 },
      }),
      ctx.rec({
        org: "nl", collection: "workflowDeliveries", n: 20, title: "Delivery evt-1001",
        status: "received", parentId: "nl-workflows-020",
        summary: "Recorded test delivery for the chase automation.",
        at: "2026-11-13T09:15:00.000Z",
        fields: { key: "evt-1001", receivedAt: "2026-11-13T09:15:00.000Z", eventAt: "2026-11-13T09:14:58.000Z", source: "test" },
        body: { status: "awaiting_payment", source: "test" },
      }),
      ctx.rec({
        org: "nl", collection: "workflowDeliveries", n: 21, title: "Delivery evt-1001 (repeat)",
        status: "received", parentId: "nl-workflows-020",
        summary: "The same key arriving twice, which the de-duplication rule drops.",
        at: "2026-11-13T09:15:40.000Z",
        fields: { key: "evt-1001", receivedAt: "2026-11-13T09:15:40.000Z", eventAt: "2026-11-13T09:14:58.000Z", source: "test" },
        body: { status: "awaiting_payment", source: "test" },
      }),
      ctx.rec({
        org: "nl", collection: "workflowDeliveries", n: 22, title: "Delivery evt-0999",
        status: "received", parentId: "nl-workflows-020",
        summary: "An older event arriving after a newer one, handled by event time.",
        at: "2026-11-13T09:16:10.000Z",
        fields: { key: "evt-0999", receivedAt: "2026-11-13T09:16:10.000Z", eventAt: "2026-11-13T08:02:00.000Z", source: "test" },
        body: { status: "awaiting_payment", source: "test" },
      }),
    ],
  };
});
