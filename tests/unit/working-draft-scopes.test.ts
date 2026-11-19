import { describe, expect, it } from "vitest";
import { clearWorkingDraft, readWorkingField, rememberWorkingField } from "@/platform/workingDrafts";

describe("cross-app draft scopes", () => {
  it("isolates CRM contact fields from People and Docs, and from other organisations", () => {
    const crm = "crm:contact:org-northline:owner:new";
    const people = "people:position:org-northline:owner:new";
    const docs = "docs:new-document:org-northline:owner:blank";
    rememberWorkingField(crm, "title", "Alice Prospect");
    rememberWorkingField(people, "title", "Designer");
    rememberWorkingField(docs, "title", "Proposal");
    expect(readWorkingField(crm, "title", "")).toBe("Alice Prospect");
    expect(readWorkingField(people, "title", "")).toBe("Designer");
    expect(readWorkingField(docs, "title", "")).toBe("Proposal");
    expect(readWorkingField("crm:contact:org-harbor:owner:new", "title", "")).toBe("");
    clearWorkingDraft(crm);
    expect(readWorkingField(crm, "title", "")).toBe("");
    expect(readWorkingField(people, "title", "")).toBe("Designer");
    clearWorkingDraft(people);
    clearWorkingDraft(docs);
  });
  it("keeps contact suppression separate and boolean until explicitly discarded", () => {
    const scope = "crm:contact:org-northline:owner:person-123";
    rememberWorkingField(scope, "suppressed", true);
    rememberWorkingField(scope, "consent", false);
    expect(readWorkingField(scope, "suppressed", false)).toBe(true);
    expect(readWorkingField(scope, "consent", true)).toBe(false);
    clearWorkingDraft(scope);
    expect(readWorkingField(scope, "suppressed", false)).toBe(false);
  });
});
