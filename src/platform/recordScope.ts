import type { Rec } from "@/domain/types";

/**
 * Detail routes must resolve the requested record and collection. A missing,
 * foreign or wrong-collection id never silently opens the first available row.
 * This is a UI guard, not a substitute for server-side authorization.
 */
export function scopedDetailRecord(
  record: Rec | undefined,
  organizationId: string,
  collection: string,
): Rec | undefined {
  return record?.organizationId === organizationId && record.collection === collection ? record : undefined;
}

/** Only documents explicitly linked to this employee or applicant may appear in a people file. */
export function linkedPersonnelDocuments(documents: Rec[], subject: Rec | undefined): Rec[] {
  if (!subject || !["employees", "applicants"].includes(subject.collection)) return [];
  const key = subject.collection === "employees" ? "employeeId" : "applicantId";
  const otherKey = subject.collection === "employees" ? "applicantId" : "employeeId";
  return documents
    .filter((row) =>
      row.collection === "documents"
      && row.organizationId === subject.organizationId
      && !["trashed", "deleted"].includes(row.status)
      && (row.parentId === subject.id || row.fields[key] === subject.id)
      // If a reference carries a specific person id, it must match this file.
      && (!row.fields[key] || row.fields[key] === subject.id)
      && !row.fields[otherKey]
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
