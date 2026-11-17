import type { Rec } from "@/domain/types";

/** Project Files must show only documents actually linked to this project.
 * A generic "project" tag is a category, never an access grant or a link.
 */
export function filesForProject(project: Rec | undefined, documents: Rec[]): Rec[] {
  if (!project || project.collection !== "projects") return [];
  return documents.filter((document) =>
    document.collection === "documents"
    && document.organizationId === project.organizationId
    && (document.parentId === project.id || String(document.fields.projectId ?? "") === project.id));
}
