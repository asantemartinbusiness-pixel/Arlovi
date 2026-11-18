import type { Rec } from "@/domain/types";
import { validateGraph, type GraphIssue, type WorkflowGraph } from "./engine";
import { referenceIssues } from "./schema";

/**
 * The full validation: graph structure from the interpreter, plus every
 * variable reference checked against the trigger's records. With no records
 * at all (an action guard that cannot read the workspace) only references
 * that are wrong regardless of the data — a variable used before it is
 * bound — are reported.
 */
export function validateWorkflow(graph: WorkflowGraph, records: Rec[]): GraphIssue[] {
  const references = referenceIssues(graph, records).filter((issue) => records.length > 0 || issue.severity === "error");
  return [...validateGraph(graph, records), ...references];
}
