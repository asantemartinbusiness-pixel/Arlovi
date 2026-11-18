import type { Rec } from "@/domain/types";

/** People inside the organisation who can own knowledge: humans, not clients, external contacts or agents. */
export function internalPeople(members: Rec[]): Rec[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    const internal = String(member.fields.kind ?? "human") === "human"
      && member.fields.external !== true
      && !["client", "agent", "guest"].includes(String(member.fields.role ?? "member"))
      && member.status !== "suspended";
    if (!internal || seen.has(member.title)) return false;
    seen.add(member.title);
    return true;
  });
}
