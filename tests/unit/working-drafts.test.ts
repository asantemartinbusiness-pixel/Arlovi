import { describe, it, expect } from "vitest";
import { clearWorkingDraft, readWorkingField, rememberWorkingField } from "../../src/platform/workingDrafts";

describe("opt-in working drafts", () => {
  it("retains incomplete invoice inputs across component unmounts", () => {
    const scope = "finance:new-invoice:org-a:alice";
    rememberWorkingField(scope, "description", "Draft item");
    rememberWorkingField(scope, "dueDays", 45);
    expect(readWorkingField(scope, "description", "")).toBe("Draft item");
    expect(readWorkingField(scope, "dueDays", 21)).toBe(45);
    clearWorkingDraft(scope);
    expect(readWorkingField(scope, "description", "")).toBe("");
  });
  it("does not mix company or person drafts", () => {
    rememberWorkingField("org-a:alice", "amount", 500);
    expect(readWorkingField("org-a:bob", "amount", 0)).toBe(0);
    expect(readWorkingField("org-b:alice", "amount", 0)).toBe(0);
    clearWorkingDraft("org-a:alice");
  });
});
