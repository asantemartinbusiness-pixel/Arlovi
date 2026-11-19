import { describe, expect, it } from "vitest";
import { clearWorkingDraft, readWorkingField, rememberWorkingField } from "@/platform/workingDrafts";

describe("complex editor continuity", () => {
  it("retains an unsaved quote's multiple pricing lines without mixing deals", () => {
    const a = "crm:quote:org-northline:owner:new:deal-1";
    const b = "crm:quote:org-northline:owner:new:deal-2";
    const lines = [
      { id: "line-1", description: "Planning", quantity: 2, unitPriceMinor: 45000 },
      { id: "line-2", description: "Implementation", quantity: 1, unitPriceMinor: 95000 },
    ];
    rememberWorkingField(a, "lines", lines);
    rememberWorkingField(a, "dirty", true);
    expect(readWorkingField(a, "lines", [])).toEqual(lines);
    expect(readWorkingField(a, "dirty", false)).toBe(true);
    expect(readWorkingField(b, "lines", [])).toEqual([]);
    clearWorkingDraft(a);
    expect(readWorkingField(a, "lines", [])).toEqual([]);
  });

  it("does not mix an employee's profile draft with another employee or organisation", () => {
    const key = "people:employee-profile:org-northline:owner:employee-22";
    rememberWorkingField(key, "title", "Operations Director");
    rememberWorkingField(key, "office", "Manchester");
    expect(readWorkingField(key, "office", "")).toBe("Manchester");
    expect(readWorkingField("people:employee-profile:org-northline:owner:employee-23", "title", "")).toBe("");
    expect(readWorkingField("people:employee-profile:org-harbor:owner:employee-22", "title", "")).toBe("");
    clearWorkingDraft(key);
    expect(readWorkingField(key, "title", "")).toBe("");
  });

  it("isolates different design and presentation setups", () => {
    const design = "design:new-file:org-northline:owner";
    const present = "present:create-layout:org-northline:owner:deck-1";
    rememberWorkingField(design, "format", "A4 print 2480 × 3508");
    rememberWorkingField(present, "name", "Hero image and caption");
    expect(readWorkingField(design, "format", "")).toContain("A4");
    expect(readWorkingField(present, "name", "")).toBe("Hero image and caption");
    clearWorkingDraft(design);
    clearWorkingDraft(present);
  });
});
