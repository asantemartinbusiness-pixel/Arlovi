import { describe, expect, it } from "vitest";
import type { Rec } from "@/domain/types";
import { linkedPersonnelDocuments, scopedDetailRecord } from "@/platform/recordScope";

const organization = "org-northline";
const at = "2026-11-16T09:00:00Z";
function record(id: string, collection: string, org: string, overrides: Partial<Rec> = {}): Rec {
  return {
    id, collection, organizationId: org, title: id, status: "active",
    ownerName: "QA", summary: "", currency: "GBP", tags: [], fields: {},
    createdAt: at, updatedAt: at, revision: 1, createdBy: "QA",
    updatedBy: "QA", history: [], ...overrides,
  };
}
const person = (id: string, collection: "employees" | "applicants" = "employees", org = organization) =>
  record(id, collection, org);
const document = (id: string, options: {
  org?: string; parentId?: string; employeeId?: string; applicantId?: string;
  status?: string; title?: string; updatedAt?: string;
} = {}) => record(id, "documents", options.org ?? organization, {
  parentId: options.parentId, title: options.title ?? id,
  status: options.status ?? "filed", updatedAt: options.updatedAt ?? at,
  fields: {
    ...(options.employeeId ? { employeeId: options.employeeId } : {}),
    ...(options.applicantId ? { applicantId: options.applicantId } : {}),
  },
});

describe("People and Documents record continuity", () => {
  it("never substitutes a missing, foreign or wrong-collection record for a detail route", () => {
    const employee = person("employee-a");
    expect(scopedDetailRecord(employee, organization, "employees")).toBe(employee);
    expect(scopedDetailRecord(employee, organization, "applicants")).toBeUndefined();
    expect(scopedDetailRecord(employee, "org-harbor", "employees")).toBeUndefined();
    expect(scopedDetailRecord(undefined, organization, "employees")).toBeUndefined();
    expect(scopedDetailRecord(document("doc-1"), organization, "documents")?.id).toBe("doc-1");
    expect(scopedDetailRecord(employee, organization, "documents")).toBeUndefined();
  });

  it("shows only real company documents explicitly linked to this employee", () => {
    const employee = person("employee-a");
    const files = [
      document("own-parent", { parentId: "employee-a", updatedAt: "2026-11-14T09:00:00Z" }),
      document("own-field", { employeeId: "employee-a", updatedAt: "2026-11-16T09:00:00Z" }),
      document("other", { parentId: "employee-b" }),
      document("foreign", { org: "org-harbor", employeeId: "employee-a" }),
      document("ambiguous", { parentId: "employee-a", employeeId: "employee-b" }),
      document("candidate", { parentId: "employee-a", applicantId: "candidate-a" }),
      document("deleted", { parentId: "employee-a", status: "trashed" }),
      document("generic", { title: "Employee contract" }),
    ];
    expect(linkedPersonnelDocuments(files, employee).map((row) => row.id)).toEqual(["own-field", "own-parent"]);
    expect(linkedPersonnelDocuments(files, undefined)).toEqual([]);
  });

  it("does not misrepresent candidate CVs as attached without a candidate link", () => {
    const candidate = person("candidate-a", "applicants");
    const files = [
      document("employee-file", { employeeId: "candidate-a" }),
      document("candidate-cv", { applicantId: "candidate-a" }),
      document("candidate-parent", { parentId: "candidate-a" }),
      document("foreign-candidate", { org: "org-harbor", applicantId: "candidate-a" }),
    ];
    expect(linkedPersonnelDocuments(files, candidate).map((row) => row.id)).toEqual(["candidate-cv", "candidate-parent"]);
    expect(linkedPersonnelDocuments([document("unlinked")], candidate)).toEqual([]);
  });
});
