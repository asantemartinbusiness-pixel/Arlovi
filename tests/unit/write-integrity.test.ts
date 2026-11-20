import { describe, expect, it, vi } from "vitest";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { ConflictError } from "@/platform/repo";
import { commitTogether } from "@/platform/commit";
import { rescindQueuedGrants } from "@/applications/hr/actions";
import { saveSite, useWebUi } from "@/applications/web/state";

const now = "2026-11-20T09:00:00.000Z";

function row(id: string, revision: number, fields: Rec["fields"] = {}): Rec {
  return {
    id, collection: "tasks", organizationId: "org-1", title: id, status: "open", ownerName: "", summary: "", currency: "GBP",
    fields, tags: [], createdAt: now, updatedAt: now, createdBy: "QA", updatedBy: "QA", revision, history: [], parentId: undefined,
  };
}

/** A store with the real compare-and-swap contract: a stale revision throws ConflictError (putMany) or returns null after a toast (patch). */
function fakeContext(stored: Record<string, Rec>) {
  const toast = vi.fn();
  const writes: string[] = [];
  const context = {
    org: { id: "org-1", currency: "GBP" },
    actor: "Elena Voss",
    screen: { id: "hr.test" },
    toast,
    mutate: {
      async putMany(records: Rec[], _messages: string[], expected: Record<string, number> = {}) {
        for (const record of records) {
          const current = stored[record.id];
          const want = expected[record.id];
          if (want !== undefined && (!current || current.revision !== want)) throw new ConflictError(record.id, want, current?.revision ?? -1);
        }
        for (const record of records) { stored[record.id] = record; writes.push(record.id); }
      },
      async patch(id: string, patch: Partial<Rec>, options?: { expectRevision?: number }) {
        const current = stored[id];
        if (options?.expectRevision !== undefined && current.revision !== options.expectRevision) {
          toast("This record changed elsewhere", "Another open surface saved first.", "blocked");
          return null;
        }
        stored[id] = { ...current, ...patch, revision: current.revision + 1 } as Rec;
        writes.push(id);
        return stored[id];
      },
    },
  } as unknown as ScreenContext;
  return { context, toast, writes };
}

describe("stale revisions never reach a success path", () => {
  it("commitTogether rolls back every member, toasts once and resolves false on a stale revision", async () => {
    const source = row("source", 4);
    const target = row("target", 7);
    const { context, toast, writes } = fakeContext({ source: { ...source, revision: 5 }, target });
    const saved = await commitTogether(context, [
      { record: source, patch: { status: "done" }, event: "Source done" },
      { record: target, patch: { status: "done" }, event: "Target done" },
    ]);
    expect(saved).toBe(false);
    expect(writes).toEqual([]);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toBe("This record changed elsewhere");
  });

  it("commitTogether binds only existing records to their read revision and saves creates with them", async () => {
    const source = row("source", 4);
    const store = { source };
    const { context, toast, writes } = fakeContext(store);
    const putMany = vi.spyOn(context.mutate, "putMany");
    const saved = await commitTogether(context, [
      { record: source, patch: { status: "done" }, event: "Source done" },
      { create: { collection: "tasks", title: "Follow-up", status: "open" }, event: "Follow-up created" },
    ]);
    expect(saved).toBe(true);
    expect(toast).not.toHaveBeenCalled();
    expect(writes).toHaveLength(2);
    const [records, messages, expected, types] = putMany.mock.calls[0];
    expect(records[0].revision).toBe(5);
    expect(expected).toEqual({ source: 4 });
    expect(messages).toEqual(["Source done", "Follow-up created"]);
    expect(types).toEqual(["update", "create"]);
  });

  it("hr rescindQueuedGrants refuses to report success when a grant changed elsewhere", async () => {
    const task = row("grant-1", 2, { employeeId: "emp-1", group: "IT access" });
    const { context } = fakeContext({ "grant-1": { ...task, revision: 3 } });
    // The patch carries no revision, so make the fake store refuse it the way a scope/conflict refusal does.
    context.mutate.patch = vi.fn(async () => null);
    await expect(rescindQueuedGrants(context, "emp-1", [task])).rejects.toThrow(/could not be rescinded/);
  });

  it("web saveSite resolves false and leaves no undo entry when the site changed elsewhere", async () => {
    const site = row("site-1", 2);
    const { context } = fakeContext({ "site-1": { ...site, revision: 3 } });
    const before = useWebUi.getState().undoDepth("site-1");
    const saved = await saveSite(context, site, {} as never, "Block inserted");
    expect(saved).toBe(false);
    expect(useWebUi.getState().undoDepth("site-1")).toBe(before);
  });
});
