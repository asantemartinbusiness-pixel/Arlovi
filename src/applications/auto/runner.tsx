import { useMemo } from "react";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { useCollections } from "@/platform/workspace";
import { listByCollection } from "@/platform/repo";
import {
  evaluateAssertions, readGraph, runWorkflow,
  type PendingWrite, type RunResult, type StoredRun, type WorkflowGraph,
} from "./engine";
import { readRun } from "./panels";

/** Collections an automation in this product can read or write. */
export const AUTOMATION_COLLECTIONS = [
  "invoices", "bills", "quotes", "orders", "deals", "leads", "contacts", "companies",
  "tasks", "tickets", "projects", "messages", "approvals", "notifications", "expenses",
  "products", "bookings", "documents", "activities",
];

/**
 * Only the collections the graph names are read, so an automation never pulls
 * the whole workspace into memory.
 */
export function graphCollections(graph: WorkflowGraph): string[] {
  const set = new Set<string>();
  for (const node of graph.nodes) {
    if (node.config?.collection) set.add(node.config.collection);
    if (node.config?.target && AUTOMATION_COLLECTIONS.includes(node.config.target)) set.add(node.config.target);
  }
  if (set.size === 0) set.add("invoices");
  return [...set].sort();
}

/** The same records as useGraphRecords, read once, for an action outside a component. */
export async function loadGraphRecords(organizationId: string, graph: WorkflowGraph): Promise<Rec[]> {
  const lists = await Promise.all(graphCollections(graph).map((name) => listByCollection(organizationId, name)));
  return lists.flat();
}

export function useGraphRecords(graph: WorkflowGraph): Rec[] {
  const names = useMemo(() => graphCollections(graph), [graph]);
  const data = useCollections(names);
  return useMemo(() => names.flatMap((name) => data[name] ?? []), [names, data]);
}

async function applyWrites(writes: PendingWrite[], context: ScreenContext, pool: Rec[], workflowId: string): Promise<string[]> {
  const applied: string[] = [];
  for (const write of writes) {
    if (write.op === "create" && write.collection) {
      const created = await context.mutate.create({
        collection: write.collection,
        title: write.title ?? "Automation output",
        status: write.status ?? "draft",
        summary: write.summary ?? "",
        parentId: write.parentId,
        amountMinor: write.amountMinor,
        fields: { ...(write.fields ?? {}), workflowId },
      }, `Created by the workflow interpreter from ${workflowId}`);
      applied.push(created.id);
      continue;
    }
    if (write.op === "patch" && write.id) {
      const target = pool.find((record) => record.id === write.id);
      const updated = await context.mutate.patch(write.id, {
        status: write.status ?? target?.status ?? "active",
        fields: { ...(target?.fields ?? {}), ...(write.fields ?? {}) },
      }, { event: `Updated by the workflow interpreter from ${workflowId}` });
      if (updated) applied.push(write.id);
      continue;
    }
    if (write.op === "tag" && write.id) {
      const target = pool.find((record) => record.id === write.id);
      if (!target) continue;
      const tags = [...new Set([...target.tags, write.tag ?? "automated"])];
      const updated = await context.mutate.patch(write.id, { tags }, { event: `Tagged by the workflow interpreter from ${workflowId}` });
      if (updated) applied.push(write.id);
      continue;
    }
    if (write.op === "log") {
      await context.mutate.log(write.summary ?? "Workflow step", { entityId: workflowId, type: "automation" });
    }
  }
  return applied;
}

export interface ExecuteOptions {
  context: ScreenContext;
  workflow: Rec;
  graph: WorkflowGraph;
  pool: Rec[];
  mode: "live" | "dry";
  trigger: string;
  decisions?: Record<string, "approved" | "rejected">;
  fixture?: Record<string, string | number | boolean>;
  /** Continue a run that stopped at an approval gate. */
  resumeRun?: Rec;
}

export interface ExecuteOutcome {
  run: RunResult;
  runId: string;
  writesApplied: string[];
}

/**
 * Runs the interpreter, applies the record changes it asked for when the run is
 * live, and stores the whole trace on a workflowRuns record. The run record is
 * the evidence; the toast is not.
 */
export async function executeRun(options: ExecuteOptions): Promise<ExecuteOutcome> {
  const { context, workflow, graph, pool, mode, trigger } = options;
  const resumeStored = options.resumeRun ? readRun(options.resumeRun) : undefined;

  const run = runWorkflow({
    graph,
    records: pool,
    now: context.now,
    actor: context.actor,
    mode,
    decisions: options.decisions,
    fixture: options.fixture,
    resume: resumeStored ? { steps: resumeStored.result.steps, variables: resumeStored.result.variables } : undefined,
  });

  const assertions = evaluateAssertions(graph, run, context.now);
  const alreadyApplied = resumeStored ? resumeStored.result.writes.length : 0;
  const newWrites = mode === "live" ? run.writes.slice(alreadyApplied) : [];
  const writesApplied = await applyWrites(newWrites, context, pool, workflow.id);

  const stored: StoredRun = {
    graph,
    result: run,
    assertions,
    trigger,
    workflowId: workflow.id,
    workflowTitle: workflow.title,
  };

  const blocked = run.steps.filter((step) => step.status === "blocked").length;
  const failed = run.steps.filter((step) => step.status === "failed").length;
  const attempts = run.steps.reduce((total, step) => total + step.attempts.length, 0);
  const fields = {
    workflowId: workflow.id,
    mode,
    trigger,
    steps: run.steps.length,
    attempts,
    durationMs: run.durationMs,
    worker: "local-interpreter",
    cursor: run.cursor ?? "",
    blocked,
    failed,
    writes: (resumeStored?.result.writes.length ?? 0) + writesApplied.length,
    assertionsPassed: assertions.filter((item) => item.pass).length,
    assertionsTotal: assertions.length,
  };

  let runId: string;
  if (options.resumeRun) {
    runId = options.resumeRun.id;
    await context.mutate.patch(options.resumeRun.id, {
      status: run.status,
      summary: run.message,
      fields: { ...options.resumeRun.fields, ...fields },
      body: stored,
    }, { expectRevision: options.resumeRun.revision, event: `Run resumed and finished as ${run.status}` });
  } else {
    const created = await context.mutate.create({
      collection: "workflowRuns",
      title: `Run · ${workflow.title} · ${context.dateTime(run.startedAt)}`,
      status: run.status,
      summary: run.message,
      parentId: workflow.id,
      at: run.startedAt,
      fields,
      body: stored,
    }, `Workflow run ${run.status} (${mode})`);
    runId = created.id;
  }

  if (mode === "live") {
    await context.mutate.patch(workflow.id, {
      fields: {
        ...workflow.fields,
        lastRunAt: run.startedAt,
        lastRunStatus: run.status,
        lastRunId: runId,
      },
    }, { event: `Last run recorded as ${run.status}` });
  }

  return { run, runId, writesApplied };
}

export function graphOf(record: Rec | undefined): WorkflowGraph {
  return readGraph(record);
}

/** A dry run: the interpreter walks the graph but no record is written. */
export function executeDry(options: {
  context: ScreenContext;
  graph: WorkflowGraph;
  pool: Rec[];
  fixture?: Record<string, string | number | boolean>;
  decisions?: Record<string, "approved" | "rejected">;
  resume?: { steps: RunResult["steps"]; variables: RunResult["variables"] };
  /** A record of the trigger's collection to test with, instead of the first match. */
  sampleId?: string;
}): RunResult {
  return runWorkflow({
    graph: options.graph,
    records: options.pool,
    now: options.context.now,
    actor: options.context.actor,
    mode: "dry",
    fixture: options.fixture,
    decisions: options.decisions,
    resume: options.resume,
    sampleId: options.sampleId,
  });
}
