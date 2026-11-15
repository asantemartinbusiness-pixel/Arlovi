import { useEffect, useState } from "react";
import type { Rec } from "@/domain/types";
import { readGraph, type RunResult, type WorkflowGraph } from "./engine";

/* ====================================================================== *
 * Builder draft store.
 *
 * The graph being edited has to be readable by the screen's declared actions
 * (save, validate, connect) as well as by the surface that draws the canvas,
 * so it lives in a small store keyed by workflow id rather than in component
 * state. It is editing state only: nothing here is persisted until Save writes
 * the graph back onto the record.
 * ====================================================================== */

export interface BuilderDraft {
  workflowId: string;
  graph: WorkflowGraph;
  dirty: boolean;
  baseRevision: number;
  lastNote: string;
  selectedNodeId?: string;
  view: "canvas" | "list";
  dryRun?: RunResult;
  dryRunAt?: string;
  fixture: Record<string, string | number | boolean>;
}

const drafts = new Map<string, BuilderDraft>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getDraft(workflowId: string): BuilderDraft | undefined {
  return drafts.get(workflowId);
}

export function updateDraft(workflowId: string, patch: Partial<BuilderDraft>): void {
  const current = drafts.get(workflowId);
  if (!current) return;
  drafts.set(workflowId, { ...current, ...patch });
  emit();
}

export function setDraftGraph(workflowId: string, graph: WorkflowGraph, note: string): void {
  const current = drafts.get(workflowId);
  if (!current) return;
  drafts.set(workflowId, { ...current, graph, dirty: true, lastNote: note });
  emit();
}

export function markSaved(workflowId: string, revision: number): void {
  const current = drafts.get(workflowId);
  if (!current) return;
  drafts.set(workflowId, { ...current, dirty: false, baseRevision: revision, lastNote: "Saved" });
  emit();
}

/** Keeps the draft in step with the record until the first local edit. */
export function useBuilderDraft(workflow: Rec | undefined): BuilderDraft | undefined {
  const [, bump] = useState(0);
  useEffect(() => {
    const listener = () => bump((value) => value + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);

  const id = workflow?.id;
  useEffect(() => {
    if (!workflow || !id) return;
    const existing = drafts.get(id);
    if (!existing) {
      drafts.set(id, {
        workflowId: id,
        graph: readGraph(workflow),
        dirty: false,
        baseRevision: workflow.revision,
        lastNote: "",
        view: "canvas",
        fixture: (readGraph(workflow).fixture ?? {}) as Record<string, string | number | boolean>,
      });
      emit();
      return;
    }
    if (!existing.dirty && existing.baseRevision !== workflow.revision) {
      drafts.set(id, { ...existing, graph: readGraph(workflow), baseRevision: workflow.revision });
      emit();
    }
  }, [workflow, id]);

  return id ? drafts.get(id) : undefined;
}
