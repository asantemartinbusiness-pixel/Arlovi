import { db } from "@/runtime/db";
import { AGENT_ASSIGNMENTS, AGENT_RECEIPTS } from "@/platform/agentWork";
import { capabilityById } from "@/platform/capability";
import type { Rec, Audit, Snapshot } from "@/domain/types";

/**
 * Fail-closed execution control plane.
 *
 * No browser-side provider calls, credentials, or imagined server execution.
 * Durable local requests are an auditable handoff contract for a future
 * authenticated worker. No record may claim a model ran without a trusted
 * server receipt. This module intentionally exposes no "mark successful".
 */
export const EXECUTION_REQUESTS = "agentExecutionRequests";
export type PreflightCode =
  | "ASSIGNMENT_CLOSED" | "TASK_MISSING" | "TASK_CLOSED"
  | "AGENT_MISSING" | "AGENT_INACTIVE" | "SOURCE_BRIEF_MISSING"
  | "SOURCE_STALE" | "BUDGET_MISSING" | "BUDGET_EXCEEDED"
  | "AUTH_NOT_CONFIGURED" | "PROVIDER_NOT_CONNECTED"
  | "WORKER_NOT_CONFIGURED" | "DUPLICATE_REQUEST";
export interface Gate { code: PreflightCode; detail: string; }
export interface Preflight {
  ready: false;
  gates: Gate[];
  estimatedCostMinor: null;
  provider: "model.inference";
  runMode: "blocked";
  assignmentId: string;
}

function snapshot(row: Rec, at: string): Snapshot {
  return { title: row.title, status: row.status, summary: row.summary, fields: { ...row.fields }, body: row.body, amountMinor: row.amountMinor, at };
}
function edited(row: Rec, status: string, actor: string, at: string): Rec {
  return { ...row, status, updatedBy: actor, updatedAt: at, revision: row.revision + 1,
    history: [snapshot(row, at), ...row.history].slice(0, 25) };
}
function log(orgId: string, actor: string, at: string, message: string, entityId: string): Audit {
  return { id: crypto.randomUUID(), organizationId: orgId, at, actor, type: "execution.preflight",
    message, entityId, screenId: "workspace-execution", capability: "blocked" };
}
function requireRow(value: Rec | undefined, orgId: string, collection: string): Rec {
  if (!value || value.organizationId !== orgId || value.collection !== collection)
    throw new Error("The requested record is not available in this organisation.");
  return value;
}
async function input(orgId: string, assignmentId: string) {
  const assignment = requireRow(await db.records.get(assignmentId), orgId, AGENT_ASSIGNMENTS);
  const [task, agent] = await Promise.all([
    db.records.get(String(assignment.fields.taskId)), db.records.get(String(assignment.fields.agentId)),
  ]);
  const receipts = await db.records.where("[organizationId+collection]").equals([orgId, AGENT_RECEIPTS]).toArray();
  const requests = await db.records.where("[organizationId+collection]").equals([orgId, EXECUTION_REQUESTS]).toArray();
  return { assignment, task, agent, receipts, requests };
}

/** Always returns a blocked state until a trusted server execution authority exists. */
export async function preflightAssignment(orgId: string, assignmentId: string): Promise<Preflight> {
  const { assignment, task, agent, receipts, requests } = await input(orgId, assignmentId);
  const gates: Gate[] = [];
  if (assignment.status !== "awaiting_provider")
    gates.push({ code: "ASSIGNMENT_CLOSED", detail: "Assignment is not awaiting execution." });
  if (!task || task.organizationId !== orgId || task.collection !== "tasks")
    gates.push({ code: "TASK_MISSING", detail: "The linked task is missing or outside the organisation." });
  else if (["completed", "archived", "cancelled"].includes(task.status))
    gates.push({ code: "TASK_CLOSED", detail: "Closed tasks cannot be executed." });
  if (!agent || agent.organizationId !== orgId || agent.collection !== "agents")
    gates.push({ code: "AGENT_MISSING", detail: "The assigned AI employee contract cannot be verified." });
  else if (agent.status !== "active")
    gates.push({ code: "AGENT_INACTIVE", detail: "AI employee contract must be active." });
  const briefs = receipts.filter(r => r.fields.assignmentId === assignmentId && r.status === "prepared_local")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (!briefs.length) gates.push({ code: "SOURCE_BRIEF_MISSING", detail: "Prepare a source brief before requesting execution." });
  else {
    const body = briefs[0].body as { task?: { revision?: number }; agent?: { revision?: number } } | undefined;
    if (!task || !agent || body?.task?.revision !== task.revision || body?.agent?.revision !== agent.revision) {
      gates.push({ code: "SOURCE_STALE", detail: "The source brief must be refreshed after task or agent changes." });
    }
  }
  // A missing cap is blocked. The client must not invent a provider rate.
  if (!agent || !Number.isFinite(Number(agent.fields.spendCapMinor)) || Number(agent.fields.spendCapMinor) <= 0)
    gates.push({ code: "BUDGET_MISSING", detail: "A positive spending ceiling must be approved for this AI employee." });
  // Cost remains unknown until server-side model pricing and metering exist.
  gates.push({ code: "BUDGET_EXCEEDED", detail: "Provider cost cannot yet be estimated or reserved safely." });
  if (requests.some(r => r.fields.assignmentId === assignmentId && r.status === "blocked"))
    gates.push({ code: "DUPLICATE_REQUEST", detail: "An execution request already exists. Review or cancel it first." });
  gates.push({ code: "AUTH_NOT_CONFIGURED", detail: "There is no verified server-side organisation membership or authenticated caller." });
  const provider = capabilityById("model.inference");
  gates.push({ code: "PROVIDER_NOT_CONNECTED", detail: provider?.note ?? "A model provider is not configured." });
  gates.push({ code: "WORKER_NOT_CONFIGURED", detail: "No durable execution queue or server worker is connected." });
  return { ready: false, gates, estimatedCostMinor: null, provider: "model.inference", runMode: "blocked", assignmentId };
}

/**
 * Store a blocked request and its full preflight receipt in one transaction.
 * This is not enqueueing a job or spending money, and it cannot transition
 * to running/completed from client code.
 */
export async function recordExecutionRequest(orgId: string, assignmentId: string, actor: string): Promise<Rec> {
  const preflight = await preflightAssignment(orgId, assignmentId);
  return db.transaction("rw", [db.records, db.events], async () => {
    const assignment = requireRow(await db.records.get(assignmentId), orgId, AGENT_ASSIGNMENTS);
    if (assignment.status !== "awaiting_provider") throw new Error("This assignment is no longer pending.");
    const existing = await db.records.where("[organizationId+collection]").equals([orgId, EXECUTION_REQUESTS]).toArray();
    if (existing.some(r => r.fields.assignmentId === assignmentId && r.status === "blocked"))
      throw new Error("There is already an open execution request for this assignment.");
    const at = new Date().toISOString();
    const request: Rec = {
      id: crypto.randomUUID(), organizationId: orgId, collection: EXECUTION_REQUESTS,
      title: `Execution requested — ${assignment.title}`, status: "blocked",
      summary: "Execution was blocked by mandatory preflight checks. No provider call was made.",
      currency: assignment.currency, ownerName: actor, tags: [], parentId: assignmentId,
      fields: { assignmentId, taskId: String(assignment.fields.taskId), agentId: String(assignment.fields.agentId),
        provider: "model.inference", gateCount: preflight.gates.length, actualCostMinor: 0, providerCalled: false },
      body: { preflight, attempts: [], providerReceipt: null, actualCostMinor: 0 },
      createdAt: at, updatedAt: at, createdBy: actor, updatedBy: actor, revision: 1, history: [],
    };
    await db.records.add(request);
    await db.events.add(log(orgId, actor, at, `Execution blocked safely: ${request.title}`, request.id));
    return request;
  });
}
export async function dismissExecutionRequest(orgId: string, requestId: string, actor: string): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const request = requireRow(await db.records.get(requestId), orgId, EXECUTION_REQUESTS);
    if (request.status !== "blocked") throw new Error("Only blocked requests can be dismissed locally.");
    const at = new Date().toISOString();
    await db.records.put(edited(request, "dismissed", actor, at));
    await db.events.add(log(orgId, actor, at, `Blocked execution request dismissed: ${request.title}`, request.id));
  });
}
