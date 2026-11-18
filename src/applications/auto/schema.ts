import type { Rec } from "@/domain/types";
import {
  entryNode, matchTrigger, projectRecord,
  type GraphIssue, type RunResult, type StepResult, type WfNode, type WorkflowGraph,
} from "./engine";

/* ====================================================================== *
 * AUTO — what a step may refer to, checked against the trigger's records.
 *
 * The trigger watches one collection. The fields a step can read under
 * `record.` are the fields those records actually carry in this workspace,
 * not a fixed list; variables are those bound by a Variable node that runs
 * before the step on some path; system bindings come from the interpreter.
 * Every reference in a condition, expression, template or trigger filter is
 * checked against that set, so a typo is an error before a run, not a silent
 * "false" during one.
 * ====================================================================== */

export type BindingType = "number" | "text" | "date" | "boolean" | "list" | "any";

export interface BindingInfo {
  path: string;
  type: BindingType;
  note: string;
  source: "record" | "trigger" | "variable" | "system";
  /** For a record field: how many trigger records carry a value. */
  coverage?: { present: number; total: number };
}

export interface Reference {
  path: string;
  where: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|$)/;

function typeOf(values: unknown[]): BindingType {
  if (values.length === 0) return "any";
  if (values.every((value) => typeof value === "number")) return "number";
  if (values.every((value) => typeof value === "boolean")) return "boolean";
  if (values.every((value) => Array.isArray(value))) return "list";
  if (values.every((value) => typeof value === "string" && ISO_DATE.test(value))) return "date";
  return "text";
}

/** The trigger's collection and the records it holds in this workspace. */
export function triggerRecords(graph: WorkflowGraph, records: Rec[]): { collection?: string; rows: Rec[] } {
  const trigger = graph.nodes.find((node) => node.type === "trigger");
  const collection = trigger?.config?.collection;
  return { collection, rows: collection ? records.filter((record) => record.collection === collection) : [] };
}

/** Fields observed on the trigger collection's records, with their type and coverage. */
export function recordFields(graph: WorkflowGraph, records: Rec[]): BindingInfo[] {
  const { collection, rows } = triggerRecords(graph, records);
  if (!collection || rows.length === 0) return [];
  const projected = rows.map(projectRecord);
  const keys = new Set<string>();
  for (const row of projected) for (const [key, value] of Object.entries(row)) if (value !== undefined && value !== null && value !== "") keys.add(key);
  return [...keys].sort().map((key) => {
    const values = projected.map((row) => row[key]).filter((value) => value !== undefined && value !== null && value !== "");
    return {
      path: `record.${key}`,
      type: typeOf(values),
      note: `${collection} field, set on ${values.length} of ${rows.length} records`,
      source: "record" as const,
      coverage: { present: values.length, total: rows.length },
    };
  });
}

/** Node ids that run before `nodeId` on at least one path from the trigger. */
export function ancestorsOf(graph: WorkflowGraph, nodeId: string): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  const seen = new Set<string>();
  const queue = [...(incoming.get(nodeId) ?? [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...(incoming.get(id) ?? []));
  }
  return seen;
}

/** Everything a step at `nodeId` can refer to. Without a node, every binding in the graph. */
export function bindingsAt(graph: WorkflowGraph, records: Rec[], nodeId?: string): BindingInfo[] {
  const fields = recordFields(graph, records);
  const before = nodeId ? ancestorsOf(graph, nodeId) : new Set(graph.nodes.map((node) => node.id));
  const out: BindingInfo[] = [...fields];
  const numericFields = fields.filter((field) => field.type === "number");
  out.push(
    { path: "overdueDays", type: "number", note: "Whole days past the record's due date, computed at run time", source: "system" },
    { path: "trigger.count", type: "number", note: "How many records matched the trigger", source: "trigger" },
    { path: "trigger.collection", type: "text", note: "The collection the trigger watches", source: "trigger" },
    { path: "trigger.at", type: "date", note: "When the run started", source: "trigger" },
    { path: "now", type: "date", note: "The workspace clock when the run started", source: "system" },
    ...numericFields.map((field) => ({
      path: `trigger.matched.${field.path.slice(7)}`,
      type: "list" as const,
      note: `Every matched record's ${field.path.slice(7)}, for sum/count/avg/max`,
      source: "trigger" as const,
    })),
  );
  for (const node of graph.nodes) {
    if (!before.has(node.id)) continue;
    if (node.type === "set" && node.config?.name) {
      out.push({ path: node.config.name, type: "number", note: `Bound by ${node.label}: ${node.config.expr ?? ""}`, source: "variable" });
    }
    if (node.type === "approval") {
      out.push({ path: "approval.decision", type: "text", note: `Decision recorded at ${node.label}`, source: "variable" });
    }
  }
  const unique = new Map<string, BindingInfo>();
  for (const binding of out) if (!unique.has(binding.path)) unique.set(binding.path, binding);
  return [...unique.values()];
}

const PATH = /^[a-zA-Z_][a-zA-Z0-9_.]*$/;

/** The paths a node reads, and where in the node each one is written. */
export function referencesOf(node: WfNode): Reference[] {
  const config = node.config ?? {};
  const out: Reference[] = [];
  if (node.type === "trigger") {
    for (const [index, filter] of (config.filters ?? []).entries()) if (filter.field) out.push({ path: filter.field, where: `filter ${index + 1}` });
  }
  if (node.type === "condition" && config.left) out.push({ path: config.left.trim(), where: "field" });
  if (node.type === "set" && config.expr) {
    const text = config.expr.trim();
    const call = text.match(/^(?:sum|count|avg|max)\(\s*([a-zA-Z0-9_.]+)\s*\)$/);
    const binary = text.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*[*+/-]\s*-?[0-9.]+$/);
    if (call) out.push({ path: call[1], where: "expression" });
    else if (binary) out.push({ path: binary[1], where: "expression" });
    else if (!Number.isFinite(Number(text)) && PATH.test(text)) out.push({ path: text, where: "expression" });
  }
  if (node.type === "action") {
    for (const [key, where] of [["titleExpr", "title template"], ["summaryExpr", node.config?.kind === "log.note" ? "log line" : "summary template"]] as const) {
      const template = config[key];
      if (!template) continue;
      for (const match of template.matchAll(/\{([a-zA-Z0-9_.]+)\}/g)) out.push({ path: match[1], where });
    }
  }
  return out;
}

function distance(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => [index, ...Array(right.length).fill(0)]);
  for (let column = 1; column <= right.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
  }
  return rows[left.length][right.length];
}

export function closest(path: string, known: string[]): string | undefined {
  let best: { path: string; score: number } | undefined;
  for (const candidate of known) {
    const score = distance(path.toLowerCase(), candidate.toLowerCase());
    if (!best || score < best.score) best = { path: candidate, score };
  }
  return best && best.score <= Math.max(2, Math.floor(path.length / 3)) ? best.path : undefined;
}

export type ReferenceState = "ok" | "unknown" | "unbound" | "unchecked";

export interface ReferenceCheck extends Reference {
  state: ReferenceState;
  message: string;
  suggestion?: string;
}

/** Checks one node's references against what is bound before it. */
export function checkNodeReferences(graph: WorkflowGraph, records: Rec[], node: WfNode): ReferenceCheck[] {
  const { collection, rows } = triggerRecords(graph, records);
  const known = bindingsAt(graph, records, node.id);
  const knownPaths = new Set(known.map((binding) => binding.path));
  const everyVariable = new Map<string, WfNode>();
  for (const other of graph.nodes) if (other.type === "set" && other.config?.name) everyVariable.set(other.config.name, other);
  return referencesOf(node).map((reference) => {
    const { path } = reference;
    if (knownPaths.has(path)) return { ...reference, state: "ok" as const, message: `${path} is bound here.` };
    const isRecordPath = path.startsWith("record.") || path.startsWith("trigger.matched.");
    if (isRecordPath && (!collection || rows.length === 0)) {
      return { ...reference, state: "unchecked" as const, message: collection ? `There are no ${collection} records in this workspace to check ${path} against.` : "Choose the trigger's collection first." };
    }
    const definer = everyVariable.get(path);
    if (definer) {
      return { ...reference, state: "unbound" as const, message: `${path} is bound by ${definer.label}, which does not run before this step on any path.` };
    }
    const suggestion = closest(path, [...knownPaths]);
    return {
      ...reference,
      state: "unknown" as const,
      suggestion,
      message: isRecordPath
        ? `No ${collection} record carries ${path.replace(/^(record|trigger\.matched)\./, "")}.${suggestion ? ` Did you mean ${suggestion}?` : ""}`
        : `${path} is not bound before this step.${suggestion ? ` Did you mean ${suggestion}?` : ""}`,
    };
  });
}

/** Reference problems for the whole graph, in the validation panel's format. */
export function referenceIssues(graph: WorkflowGraph, records: Rec[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  for (const node of graph.nodes) {
    for (const check of checkNodeReferences(graph, records, node)) {
      if (check.state === "ok") continue;
      issues.push({
        id: `ref-${node.id}-${check.where}-${check.path}`,
        severity: check.state === "unchecked" ? "warning" : "error",
        nodeId: node.id,
        title: check.state === "unchecked" ? `${check.path} cannot be checked yet` : `${node.label}: ${check.path} is ${check.state === "unbound" ? "used before it is bound" : "not a known field"}`,
        detail: `In the ${check.where}. ${check.message}`,
      });
    }
  }
  return issues;
}

/* ------------------------------ local test path ------------------------------ */

export interface SampleOption {
  id: string;
  title: string;
  matches: boolean;
}

/** Records the tester can pick as the sample: the trigger's matches first, then the rest. */
export function sampleOptions(graph: WorkflowGraph, records: Rec[], now: Date): SampleOption[] {
  const trigger = entryNode(graph);
  const { rows } = triggerRecords(graph, records);
  if (!trigger || trigger.type !== "trigger") return [];
  const matched = new Set(matchTrigger(trigger.config ?? {}, records, now).map((record) => record.id));
  return rows
    .map((record) => ({ id: record.id, title: record.title, matches: matched.has(record.id) }))
    .sort((left, right) => Number(right.matches) - Number(left.matches) || left.title.localeCompare(right.title));
}

export interface PathStep {
  index: number;
  nodeId: string;
  label: string;
  type: WfNode["type"];
  status: StepResult["status"];
  decision: string;
  next?: string;
}

/** The run as a person reads it: each step, what was decided, and where it went next. */
export function describePath(graph: WorkflowGraph, run: RunResult): { steps: PathStep[]; notReached: WfNode[] } {
  const label = (id?: string) => graph.nodes.find((node) => node.id === id)?.label;
  const steps = run.steps.map((step, index) => {
    const following = run.steps[index + 1];
    let decision = step.message;
    if (step.nodeType === "condition") decision = `${step.message}, so the run took “${step.branch === "then" ? "when true" : "when false"}”.`;
    if (step.nodeType === "approval" && step.status === "waiting") decision = `${step.message} A local test stops here, as a real run would.`;
    if (step.nodeType === "approval" && step.status === "ok" && run.mode === "dry") decision = `Assumed ${step.branch === "approved" ? "approved" : "rejected"} for this test. No decision was recorded and nobody was asked.`;
    return {
      index: step.index,
      nodeId: step.nodeId,
      label: step.label,
      type: step.nodeType,
      status: step.status,
      decision,
      next: following ? label(following.nodeId) : undefined,
    };
  });
  const reached = new Set(run.steps.map((step) => step.nodeId));
  return { steps, notReached: graph.nodes.filter((node) => !reached.has(node.id)) };
}
