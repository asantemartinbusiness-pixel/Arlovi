import { describe, expect, it, vi } from "vitest";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { tagMissions } from "@/applications/mission";

function mission(id: string, revision: number): Rec {
  return {
    id, collection: "missions", organizationId: "org-1", title: id, status: "running", ownerName: "", summary: "", currency: "GBP",
    fields: {}, tags: [], createdAt: "", updatedAt: "", createdBy: "QA", updatedBy: "QA", revision, history: [], parentId: undefined,
  };
}

describe("tagMissions", () => {
  it("counts only missions that saved; a stale revision returns null and is not counted", async () => {
    const stored: Record<string, Rec> = { a: mission("a", 2), b: mission("b", 1) };
    const patch = vi.fn(async (id: string, _p: unknown, options?: { expectRevision?: number }) =>
      options?.expectRevision !== undefined && stored[id].revision !== options.expectRevision ? null : stored[id]);
    const context = { mutate: { patch } } as unknown as ScreenContext;
    // "a" was read at revision 1 but is now at 2: stale.
    const tagged = await tagMissions(context, [mission("a", 1), mission("b", 1)], "priority");
    expect(tagged).toBe(1);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls.every((call) => (call[2] as { expectRevision?: number }).expectRevision === 1)).toBe(true);
  });
});
