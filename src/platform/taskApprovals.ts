import { db } from "@/runtime/db";
import type { Audit, Rec, Snapshot } from "@/domain/types";

/**
 * Local, auditable approval workflow for task completion.
 * No background agent execution, external provider action or server-backed role
 * verification is implied. The final decision and task state change are atomic.
 */
const COLLECTION = "workflowApprovals" as const;
export type ApprovalDecision = "approved" | "rejected";

function before(record: Rec, at: string): Snapshot {
  return { title: record.title, status: record.status, summary: record.summary,
    fields: { ...record.fields }, body: record.body, amountMinor: record.amountMinor, at };
}

function updated(record: Rec, patch: Partial<Rec>, actor: string, at: string): Rec {
  return {
    ...record, ...patch, id: record.id, organizationId: record.organizationId,
    collection: record.collection,
    fields: patch.fields ? { ...record.fields, ...patch.fields } : record.fields,
    revision: record.revision + 1,
    updatedAt: at, updatedBy: actor,
    history: [before(record, at), ...record.history].slice(0, 25),
  };
}

function event(orgId: string, actor: string, at: string, message: string, entityId: string): Audit {
  return { id: crypto.randomUUID(), organizationId: orgId, actor, at, type: "workflow", message, entityId, screenId: "workspace-approvals" };
}

export class ApprovalConflict extends Error {
  constructor(message: string) { super(message); this.name = "ApprovalConflict"; }
}

export async function requestTaskCompletion(orgId: string, taskId: string, actor: string): Promise<Rec> {
  return db.transaction("rw", [db.records, db.events], async () => {
    const task = await db.records.get(taskId);
    if (!task || task.organizationId !== orgId || task.collection !== "tasks") throw new ApprovalConflict("Task does not belong to this workspace.");
    if (["completed", "cancelled", "archived"].includes(task.status)) throw new ApprovalConflict("This task is already closed.");
    const existing = await db.records.where("[organizationId+collection]").equals([orgId, COLLECTION]).toArray();
    if (existing.some(req => req.fields.taskId === task.id && req.status === "awaiting_approval")) throw new ApprovalConflict("An approval is already pending for this task.");
    const at = new Date().toISOString();
    const request: Rec = {
      id: crypto.randomUUID(), organizationId: orgId, collection: COLLECTION,
      title: `Complete: ${task.title}`, status: "awaiting_approval",
      ownerName: actor, summary: `Requested completion review for ${task.title}.`,
      currency: task.currency, tags: [], body: undefined,
      fields: { taskId: task.id, taskRevision: task.revision, requestedState: "completed", requestedBy: actor,
        ...(typeof task.fields.projectId === "string" ? { projectId: task.fields.projectId } : {}),
        ...(typeof task.fields.departmentId === "string" ? { departmentId: task.fields.departmentId } : {}),
      },
      parentId: task.parentId,
      createdAt: at, updatedAt: at, createdBy: actor, updatedBy: actor,
      revision: 1, history: [],
    };
    await db.records.add(request);
    await db.events.add(event(orgId, actor, at, `Completion review requested: ${task.title}`, request.id));
    return request;
  });
}

/** Decision and task update commit together; stale requests fail with no partial state. */
export async function decideTaskApproval(orgId: string, requestId: string, actor: string, decision: ApprovalDecision): Promise<void> {
  await db.transaction("rw", [db.records, db.events], async () => {
    const request = await db.records.get(requestId);
    if (!request || request.organizationId !== orgId || request.collection !== COLLECTION) throw new ApprovalConflict("Approval request not found in this company.");
    if (request.status !== "awaiting_approval") throw new ApprovalConflict("This request has already been decided.");
    const taskId = request.fields.taskId;
    if (typeof taskId !== "string") throw new ApprovalConflict("Approval has no linked task.");
    const task = await db.records.get(taskId);
    if (!task || task.organizationId !== orgId || task.collection !== "tasks") throw new ApprovalConflict("The linked task cannot be accessed.");
    if (task.revision !== Number(request.fields.taskRevision)) throw new ApprovalConflict("Task changed since the request. Review the task and request approval again.");
    if (["completed", "cancelled", "archived"].includes(task.status)) throw new ApprovalConflict("This task was already closed.");
    const at = new Date().toISOString();
    await db.records.put(updated(request, { status: decision, fields: { decidedBy: actor, decisionAt: at } }, actor, at));
    if (decision === "approved") {
      await db.records.put(updated(task, { status: "completed", fields: { stage: "completed", completionApprovalId: request.id } }, actor, at));
    }
    await db.events.add(event(orgId, actor, at, `Task completion ${decision}: ${task.title}`, request.id));
  });
}
