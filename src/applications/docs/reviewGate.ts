import type { DocModel } from "./model";

/** Every document publishing/approval entry point must enforce the same
 * evidence rule: unresolved mandatory reviews and open changes block release. */
export function publicationBlockers(model: DocModel): string[] {
  const mandatory = model.comments.filter((comment) => comment.mandatory && !comment.resolved).length;
  const suggestions = model.suggestions.filter((suggestion) => suggestion.status === "open").length;
  return [
    ...(mandatory > 0 ? [mandatory + " mandatory review comment" + (mandatory === 1 ? "" : "s") + " unresolved"] : []),
    ...(suggestions > 0 ? [suggestions + " tracked change" + (suggestions === 1 ? "" : "s") + " awaiting decision"] : []),
  ];
}
