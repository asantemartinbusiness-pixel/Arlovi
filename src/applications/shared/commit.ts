import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { clockIso } from "@/platform/clock";
import { ConflictError, newRecord, revisedRecord, type NewRecordInput } from "@/platform/repo";

/**
 * One member of a multi-record change. An update is bound to the revision of the
 * record the handler read; a create is a brand-new record.
 */
export type TogetherChange =
  | { record: Rec; patch: Partial<Rec>; event: string }
  | { create: Omit<NewRecordInput, "organizationId" | "currency"> & { currency?: string }; event: string };

/**
 * Commit two or more related records in ONE transaction (`mutate.putMany` with
 * `expectedRevisions`). A stale revision rolls back every member, toasts the same
 * "changed elsewhere" notice as `mutate.patch`, and resolves `false` so the caller
 * can return before any success toast, close or follow-up write. Resolves `true`
 * once everything is saved. Any other failure is rethrown for the caller's catch.
 */
export async function commitTogether(context: ScreenContext, changes: TogetherChange[]): Promise<boolean> {
  const now = clockIso();
  const write = { actor: context.actor, now, screenId: context.screen.id };
  const records: Rec[] = [];
  const messages: string[] = [];
  const eventTypes: ("create" | "update")[] = [];
  const expectedRevisions: Record<string, number> = {};
  for (const change of changes) {
    if ("create" in change) {
      records.push(newRecord({ ...change.create, organizationId: context.org.id, currency: change.create.currency ?? context.org.currency }, write));
      eventTypes.push("create");
    } else {
      records.push(revisedRecord(change.record, change.patch, write));
      expectedRevisions[change.record.id] = change.record.revision;
      eventTypes.push("update");
    }
    messages.push(change.event);
  }
  try {
    await context.mutate.putMany(records, messages, expectedRevisions, eventTypes);
    return true;
  } catch (error) {
    if (error instanceof ConflictError) {
      context.toast("This record changed elsewhere", "Another open surface saved first. Reload the record and apply the change again.", "blocked");
      return false;
    }
    throw error;
  }
}
