import { clockIso } from "@/platform/clock";
import { db } from "@/runtime/db";
import { capabilityById } from "@/platform/capability";
import type { Audit, Rec, Snapshot } from "@/domain/types";

/**
 * Auditable AI work assignment contract. This browser has no model provider,
 * worker, or authenticated server. Assignment and locally generated source
 * briefs are real records; model execution is explicitly NOT initiated.
 */
export class AgentWorkError extends Error {
  constructor(message: string) { super(message); this.name = "AgentWorkError"; }
}
export const AGENT_ASSIGNMENTS = "agentWorkAssignments";
export const AGENT_RECEIPTS = "agentWorkReceipts";

function snapshot(row: Rec, at: string): Snapshot {
  return { title: row.title, status: row.status, summary: row.summary,
    fields: { ...row.fields }, body: row.body, amountMinor: row.amountMinor, at };
}
function update(row: Rec, patch: Partial<Rec>, actor: string, at: string): Rec {
  return {
    ...row, ...patch, id: row.id, organizationId: row.organizationId,
    collection: row.collection, fields: patch.fields ? { ...row.fields, ...patch.fields } : row.fields,
    revision: row.revision + 1, updatedAt: at, updatedBy: actor,
    history: [snapshot(row, at), ...row.history].slice(0, 25),
  };
}
function audit(orgId: string, actor: string, at: string, message: string, entityId: string): Audit {
  return { id: crypto.randomUUID(), organizationId: orgId, actor, at,
    type: "agent.assignment", message, entityId, screenId: "workspace-agent-assignments",
    capability: "not_connected" };
}
function fresh(input: {
  orgId: string; actor: string; at: string; collection: string; title: string; status: string;
  summary: string; currency: string; parentId?: string;
  fields: Record<string, string | number | boolean>; body?: unknown;
}): Rec {
  return {
    id: crypto.randomUUID(), organizationId: input.orgId, collection: input.collection,
    title: input.title, status: input.status, summary: input.summary,
    ownerName: input.actor, currency: input.currency, parentId: input.parentId,
    fields: input.fields, body: input.body, tags: [], revision: 1,
    createdAt: input.at, updatedAt: input.at, createdBy: input.actor,
    updatedBy: input.actor, history: [],
  };
}
function currentOrgRow(record: Rec | undefined, orgId: string, collection: string): Rec {
  if (!record || record.organizationId !== orgId || record.collection !== collection)
    throw new AgentWorkError("Record is missing or belongs to a different organisation.");
  return record;
}
function activeTask(task: Rec) {
  if (["completed", "cancelled", "archived"].includes(task.status))
    throw new AgentWorkError("Closed tasks cannot be delegated to AI.");
}

export async function assignAgentToTask(orgId: string, taskId: string, agentId: string, actor: string): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const task = currentOrgRow(await db.records.get(taskId), orgId, "tasks");
    const agent = currentOrgRow(await db.records.get(agentId), orgId, "agents");
    activeTask(task);
    if (agent.status !== "active") throw new AgentWorkError("Only active AI employee contracts can receive assignments.");
    const assignments = await db.records.where("[organizationId+collection]").equals([orgId, AGENT_ASSIGNMENTS]).toArray();
    if (assignments.some(row => row.fields.taskId === task.id && row.status === "awaiting_provider"))
      throw new AgentWorkError("This task already has a pending AI assignment. Cancel it before reassigning.");
    const at = clockIso();
    const capability = capabilityById("model.inference");
    const assignment = fresh({
      orgId, actor, at, collection: AGENT_ASSIGNMENTS,
      title: `${agent.title} — ${task.title}`, status: "awaiting_provider",
      summary: "Assignment recorded; no model has been called and no work has been executed.",
      currency: task.currency, parentId: task.id,
      fields: {
        taskId: task.id, agentId: agent.id, agentName: agent.title,
        taskRevision: task.revision, providerCapability: "model.inference",
        providerStatus: capability?.state ?? "not_connected",
        ...(typeof task.fields.projectId === "string" ? { projectId: task.fields.projectId } : {}),
        ...(typeof task.fields.departmentId === "string" ? { departmentId: task.fields.departmentId } : {}),
      },
    });
    await db.records.add(assignment);
    await db.records.put(update(task, { fields: { aiAssignmentId: assignment.id, aiAssignedTo: agent.title } }, actor, at));
    await db.events.add(audit(orgId, actor, at, `AI work assigned, pending provider: ${task.title} → ${agent.title}`, assignment.id));
    return assignment;
  });
}

/** Create a reproducible local source brief. This is NOT model inference. */
export async function prepareAgentBrief(orgId: string, assignmentId: string, actor: string): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const assignment = currentOrgRow(await db.records.get(assignmentId), orgId, AGENT_ASSIGNMENTS);
    if (assignment.status !== "awaiting_provider") throw new AgentWorkError("This assignment is not pending.");
    const taskId = String(assignment.fields.taskId);
    const agentId = String(assignment.fields.agentId);
    const task = currentOrgRow(await db.records.get(taskId), orgId, "tasks");
    const agent = currentOrgRow(await db.records.get(agentId), orgId, "agents");
    activeTask(task);
    if (task.fields.aiAssignmentId !== assignmentId)
      throw new AgentWorkError("The task no longer references this assignment.");
    const related = await db.records.where("organizationId").equals(orgId).toArray();
    const docs = related.filter(row => row.collection === "documents" && (
      (Boolean(task.parentId) && row.parentId === task.parentId) ||
      (task.fields.projectId && row.fields.projectId === task.fields.projectId) ||
      (task.fields.departmentId && row.fields.departmentId === task.fields.departmentId)
    )).slice(0, 20);
    const at = clockIso();
    const brief = {
      task: { id: task.id, revision: task.revision, title: task.title, status: task.status, summary: task.summary },
      agent: { id: agent.id, revision: agent.revision, name: agent.title, status: agent.status },
      documents: docs.map(row => ({ id: row.id, revision: row.revision, title: row.title, summary: row.summary })),
      provenance: "Local records, no generated model content",
      provider: "model.inference — not connected",
    };
    const receipt = fresh({
      orgId, actor, at, collection: AGENT_RECEIPTS, title: `Source brief — ${task.title}`,
      status: "prepared_local", currency: task.currency, parentId: assignment.id,
      summary: `Prepared a source brief for ${agent.title} from ${docs.length + 2} local records; no AI executed.`,
      fields: { assignmentId: assignment.id, taskId: task.id, agentId: agent.id, sourceCount: docs.length + 2,
        providerStatus: "not_connected" },
      body: brief,
    });
    await db.records.add(receipt);
    await db.events.add(audit(orgId, actor, at, `Local source brief prepared (no model call): ${task.title}`, receipt.id));
    return receipt;
  });
}

/** Cancel without clobbering unrelated edits to the task. */
export async function cancelAgentAssignment(orgId: string, assignmentId: string, actor: string): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const assignment = currentOrgRow(await db.records.get(assignmentId), orgId, AGENT_ASSIGNMENTS);
    if (assignment.status !== "awaiting_provider") throw new AgentWorkError("Assignment already closed.");
    const at = clockIso();
    const task = await db.records.get(String(assignment.fields.taskId));
    await db.records.put(update(assignment, { status: "cancelled" }, actor, at));
    if (task && task.organizationId === orgId && task.collection === "tasks" && task.fields.aiAssignmentId === assignment.id)
      await db.records.put(update(task, { fields: { aiAssignmentId: "", aiAssignedTo: "" } }, actor, at));
    await db.events.add(audit(orgId, actor, at, `AI assignment cancelled: ${assignment.title}`, assignment.id));
  });
}
