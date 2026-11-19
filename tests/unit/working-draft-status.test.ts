import { describe, expect, it } from "vitest";
import { clearWorkingDraft, countWorkingDrafts, hasWorkingDraft,
  readWorkingField, rememberWorkingField, subscribeWorkingDrafts } from "@/platform/workingDrafts";

describe("working draft save status", () => {
  it("reflects changes and explicit discard, but never persists the value in a URL", () => {
    const scope = "finance:new-invoice:org-status:Alex";
    const events: number[] = [];
    const unsubscribe = subscribeWorkingDrafts(() => events.push(countWorkingDrafts("org-status", "Alex")));
    try {
      expect(hasWorkingDraft(scope)).toBe(false);
      rememberWorkingField(scope, "description", "Sensitive draft content");
      expect(readWorkingField(scope, "description", "")).toBe("Sensitive draft content");
      expect(hasWorkingDraft(scope)).toBe(true);
      expect(countWorkingDrafts("org-status", "Alex")).toBe(1);
      clearWorkingDraft(scope);
      expect(countWorkingDrafts("org-status", "Alex")).toBe(0);
      expect(events).toEqual([1, 0]);
    } finally { unsubscribe(); clearWorkingDraft(scope); }
  });
  it("does not report an unchanged, hydrated quote as an unsaved draft", () => {
    const scope = "crm:quote:org-status:Alex:quote-7";
    rememberWorkingField(scope, "lines", [{ description: "Saved line" }]);
    rememberWorkingField(scope, "dirty", false);
    expect(hasWorkingDraft(scope)).toBe(false);
    expect(countWorkingDrafts("org-status", "Alex")).toBe(0);
    rememberWorkingField(scope, "dirty", true);
    expect(hasWorkingDraft(scope)).toBe(true);
    expect(countWorkingDrafts("org-status", "Alex")).toBe(1);
    clearWorkingDraft(scope);
    expect(hasWorkingDraft(scope)).toBe(false);
  });
  it("counts company and actor scopes separately without revealing draft details", () => {
    const a = "crm:new-lead:org-one:Alex";
    const b = "project:create:org-two:Alex";
    const c = "docs:new-document:org-one:Sam:blank";
    rememberWorkingField(a, "title", "Lead");
    rememberWorkingField(b, "title", "Project");
    rememberWorkingField(c, "title", "Document");
    expect(countWorkingDrafts("org-one", "Alex")).toBe(1);
    expect(countWorkingDrafts("org-one", "Sam")).toBe(1);
    expect(countWorkingDrafts("org-two", "Alex")).toBe(1);
    clearWorkingDraft(a);clearWorkingDraft(b);clearWorkingDraft(c);
  });
});
