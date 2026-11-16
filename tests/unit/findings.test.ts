import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { conflictsOfFact, internalPeople } from "@/applications/brain/index";
import { separationOfDuties } from "@/applications/proc/overlays";

/* Findings from the journeys that no journey asserts; each is closed here. */

function rec(partial: Partial<Rec> & { id: string; title: string }): Rec {
  return {
    organizationId: "org", collection: "members", status: "active", summary: "", fields: {}, body: {},
    history: [], revision: 1, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", ...partial,
  } as unknown as Rec;
}

describe("DEF-33 route to owner offers only internal people", () => {
  it("drops clients, agents, external contacts, suspended members and duplicates", () => {
    const people = internalPeople([
      rec({ id: "1", title: "Maya Chen", fields: { role: "owner" } }),
      rec({ id: "2", title: "Hollis Metalwork", fields: { role: "client" } }),
      rec({ id: "3", title: "Nia Okonkwo", fields: { kind: "agent" } }),
      rec({ id: "4", title: "Lumen contact", fields: { external: true } }),
      rec({ id: "5", title: "Former staff", status: "suspended" }),
      rec({ id: "6", title: "Maya Chen", fields: { role: "owner" } }),
      rec({ id: "7", title: "Priya Shah", fields: { role: "member" } }),
    ]);
    expect(people.map((person) => person.title)).toEqual(["Maya Chen", "Priya Shah"]);
  });
});

describe("DEF-34 one conflict count for list and detail", () => {
  it("counts open and in-review conflicts that name the fact, directly or as an option", () => {
    const fact = rec({ id: "f1", title: "Saturday closing time", collection: "assertions" });
    const conflicts = [
      rec({ id: "c1", title: "a", collection: "conflicts", status: "open", fields: { factId: "f1" } }),
      rec({ id: "c2", title: "b", collection: "conflicts", status: "resolved", fields: { factId: "f1" } }),
      rec({ id: "c3", title: "c", collection: "conflicts", status: "open", fields: { factId: "other" } }),
    ];
    expect(conflictsOfFact(fact, conflicts).map((conflict) => conflict.id)).toEqual(["c1"]);
  });
});

describe("DEF-37 separation of duties on requisitions", () => {
  const requisition = rec({ id: "r1", title: "REQ-333", collection: "purchaseOrders", fields: { requester: "Jonah Adeyemi" } });
  it("refuses a requester approving their own requisition", () => {
    expect(separationOfDuties(requisition, "Jonah Adeyemi", "finance").refused).toMatch(/cannot also approve/);
  });
  it("lets another person approve", () => {
    expect(separationOfDuties(requisition, "Maya Chen", "owner")).toEqual({ ownerSelfApproval: false });
  });
  it("records an owner's self-approval instead of hiding it", () => {
    const owner = rec({ id: "r2", title: "REQ-334", collection: "purchaseOrders", fields: { requester: "Maya Chen" } });
    expect(separationOfDuties(owner, "Maya Chen", "owner")).toEqual({ ownerSelfApproval: true });
  });
});
