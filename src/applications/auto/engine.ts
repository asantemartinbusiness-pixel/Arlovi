import type { Rec } from "@/domain/types";
import { capabilityById } from "@/platform/capability";
import type { CapabilityState } from "@/domain/types";

/* ====================================================================== *
 * AUTO — deterministic local workflow interpreter.
 *
 * Audit A19: pressing Run must evaluate the graph, not set a status string.
 * This module is pure. It takes a graph, the org-scoped records it is allowed
 * to read, a clock and a mode, and returns every step it took with the input
 * it saw, the output it produced, the attempts it made and a receipt for each.
 *
 * It never performs I/O. Steps that would touch an external service stop at
 * the provider boundary in `src/platform/capability.ts` and are recorded as
 * not run. Record writes are returned as intents; the calling screen applies
 * them through the normal mutation path, and only in `live` mode.
 * ====================================================================== */

export type NodeKind = "trigger" | "condition" | "set" | "action" | "approval" | "delay";

export type ConditionOp =
  | "gt" | "gte" | "lt" | "lte" | "eq" | "neq"
  | "contains" | "olderThanDays" | "isEmpty" | "isTrue";

export const CONDITION_OPS: { id: ConditionOp; label: string; needsValue: boolean }[] = [
  { id: "gt", label: "is greater than", needsValue: true },
  { id: "gte", label: "is at least", needsValue: true },
  { id: "lt", label: "is less than", needsValue: true },
  { id: "lte", label: "is at most", needsValue: true },
  { id: "eq", label: "equals", needsValue: true },
  { id: "neq", label: "does not equal", needsValue: true },
  { id: "contains", label: "contains", needsValue: true },
  { id: "olderThanDays", label: "is older than (days)", needsValue: true },
  { id: "isEmpty", label: "is empty", needsValue: false },
  { id: "isTrue", label: "is true", needsValue: false },
];

export type ActionKind =
  | "record.create"
  | "record.patch"
  | "record.tag"
  | "log.note"
  | "provider.call";

export const ACTION_KINDS: { id: ActionKind; label: string; writes: boolean; description: string }[] = [
  { id: "record.create", label: "Create a record", writes: true, description: "Writes a new record in this workspace." },
  { id: "record.patch", label: "Update a record", writes: true, description: "Patches the record bound to the step input." },
  { id: "record.tag", label: "Tag a record", writes: true, description: "Adds a tag to the bound record." },
  { id: "log.note", label: "Write to the activity log", writes: true, description: "Appends an audit entry, nothing else." },
  { id: "provider.call", label: "Call a provider", writes: false, description: "Stops at the provider boundary; nothing leaves the browser." },
];

export interface WfNodeConfig {
  /* trigger */
  collection?: string;
  event?: "record.matches" | "record.overdue" | "schedule" | "webhook";
  schedule?: string;
  timezone?: string;
  /** Extra tests applied to every candidate record before it is bound. */
  filters?: { field: string; op: ConditionOp; value: string }[];
  /* condition */
  left?: string;
  op?: ConditionOp;
  right?: string;
  /* set */
  name?: string;
  expr?: string;
  /* action */
  kind?: ActionKind;
  capability?: string;
  target?: string;
  titleExpr?: string;
  summaryExpr?: string;
  tag?: string;
  retries?: number;
  onError?: "halt" | "continue";
  impact?: "low" | "high";
  sensitive?: boolean;
  /* approval */
  approvers?: string;
  /* delay */
  minutes?: number;
}

export interface WfNode {
  id: string;
  type: NodeKind;
  label: string;
  x: number;
  y: number;
  config?: WfNodeConfig;
}

export type PortId = "out" | "then" | "else" | "approved" | "rejected";

export interface WfEdge {
  id?: string;
  from: string;
  to: string;
  port?: PortId;
}

export interface WfAssertion {
  id: string;
  nodeId: string;
  subject: "status" | "variable";
  name?: string;
  op: ConditionOp;
  value?: string;
}

export interface WorkflowGraph {
  nodes: WfNode[];
  edges: WfEdge[];
  limits?: { maxSteps?: number; maxVisits?: number };
  fixture?: Record<string, string | number | boolean>;
  assertions?: WfAssertion[];
}

export const DEFAULT_LIMITS = { maxSteps: 40, maxVisits: 3 };

export function portsFor(type: NodeKind): { id: PortId; label: string }[] {
  if (type === "condition") return [{ id: "then", label: "when true" }, { id: "else", label: "when false" }];
  if (type === "approval") return [{ id: "approved", label: "approved" }, { id: "rejected", label: "rejected" }];
  return [{ id: "out", label: "next" }];
}

/* ------------------------------ graph reading ------------------------------ */

export function readGraph(record: Rec | undefined): WorkflowGraph {
  const body = record?.body as Partial<WorkflowGraph> | undefined;
  const nodes = Array.isArray(body?.nodes) ? (body?.nodes as WfNode[]) : [];
  const edges = Array.isArray(body?.edges) ? (body?.edges as WfEdge[]) : [];
  return {
    nodes: nodes.map((node, index) => ({
      id: node.id ?? `n${index}`,
      type: (node.type ?? "action") as NodeKind,
      label: node.label ?? node.id ?? `Step ${index + 1}`,
      x: Number.isFinite(node.x) ? node.x : 40 + index * 180,
      y: Number.isFinite(node.y) ? node.y : 80,
      config: node.config ?? defaultConfigFor((node.type ?? "action") as NodeKind, node.label ?? ""),
    })),
    edges: edges.map((edge, index) => ({ id: edge.id ?? `e${index}`, from: edge.from, to: edge.to, port: edge.port ?? "out" })),
    limits: { ...DEFAULT_LIMITS, ...(body?.limits ?? {}) },
    fixture: body?.fixture ?? {},
    assertions: Array.isArray(body?.assertions) ? body!.assertions : [],
  };
}

/**
 * The base seed stores nodes without configuration. Rather than invent values,
 * give each node a configuration that matches what its label already claims and
 * leave the rest empty so the inspector shows what is still missing.
 */
export function defaultConfigFor(type: NodeKind, label: string): WfNodeConfig {
  const lower = label.toLowerCase();
  if (type === "trigger") {
    return lower.includes("invoice")
      ? { collection: "invoices", event: "record.overdue", timezone: "Europe/London" }
      : { collection: "tasks", event: "record.matches", timezone: "Europe/London" };
  }
  if (type === "condition") {
    const days = lower.match(/(\d+)\s*day/);
    return days
      ? { left: "record.dueAt", op: "olderThanDays", right: days[1] }
      : { left: "record.amountMinor", op: "gt", right: "0" };
  }
  if (type === "approval") return { approvers: "Finance" };
  if (type === "delay") return { minutes: 60 };
  if (type === "set") return { name: "total", expr: "sum(trigger.matched.amountMinor)" };
  if (lower.includes("email") || lower.includes("send")) {
    return { kind: "provider.call", capability: "email.send", impact: "high", retries: 1, onError: "halt", sensitive: true };
  }
  if (lower.includes("draft") || lower.includes("reminder")) {
    return { kind: "record.create", target: "messages", titleExpr: "Reminder for {record.title}", summaryExpr: "{record.title} is overdue by {overdueDays} days.", retries: 0, onError: "halt", impact: "low" };
  }
  return { kind: "log.note", summaryExpr: label, retries: 0, onError: "halt", impact: "low" };
}

/* ------------------------------ validation ------------------------------ */

export interface GraphIssue {
  id: string;
  severity: "error" | "warning";
  nodeId?: string;
  title: string;
  detail: string;
}

export function findCycles(graph: WorkflowGraph): string[][] {
  const out = new Map<string, string[]>();
  for (const node of graph.nodes) out.set(node.id, []);
  for (const edge of graph.edges) out.get(edge.from)?.push(edge.to);
  const cycles: string[][] = [];
  const colour = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  function walk(id: string) {
    colour.set(id, 1);
    stack.push(id);
    for (const next of out.get(id) ?? []) {
      const seen = colour.get(next) ?? 0;
      if (seen === 0) walk(next);
      else if (seen === 1) {
        const from = stack.indexOf(next);
        if (from >= 0) cycles.push([...stack.slice(from), next]);
      }
    }
    colour.set(id, 2);
    stack.pop();
  }
  for (const node of graph.nodes) if ((colour.get(node.id) ?? 0) === 0) walk(node.id);
  return cycles;
}

export function reachableFrom(graph: WorkflowGraph, startId: string | undefined): Set<string> {
  const seen = new Set<string>();
  if (!startId) return seen;
  const queue = [startId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of graph.edges) if (edge.from === id) queue.push(edge.to);
  }
  return seen;
}

export function entryNode(graph: WorkflowGraph): WfNode | undefined {
  return graph.nodes.find((node) => node.type === "trigger") ?? graph.nodes[0];
}

export function validateGraph(graph: WorkflowGraph, records: Rec[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const triggers = graph.nodes.filter((node) => node.type === "trigger");
  if (triggers.length === 0) {
    issues.push({ id: "no-trigger", severity: "error", title: "No trigger", detail: "A workflow starts at a trigger node. Add one from the palette." });
  }
  if (triggers.length > 1) {
    issues.push({ id: "many-triggers", severity: "error", title: `${triggers.length} triggers`, detail: "Only one trigger can start a run. Remove the extra trigger or split the workflow." });
  }
  const entry = entryNode(graph);
  const reachable = reachableFrom(graph, entry?.id);
  for (const node of graph.nodes) {
    if (!reachable.has(node.id)) {
      issues.push({ id: `unreachable-${node.id}`, severity: "warning", nodeId: node.id, title: `${node.label} is never reached`, detail: "No path from the trigger arrives at this node, so it will not run." });
    }
    const config = node.config ?? {};
    if (node.type === "trigger") {
      if (!config.collection) issues.push({ id: `trigger-collection-${node.id}`, severity: "error", nodeId: node.id, title: "Trigger has no collection", detail: "Choose the records this trigger watches." });
      else if (!records.some((record) => record.collection === config.collection)) {
        issues.push({ id: `trigger-empty-${node.id}`, severity: "warning", nodeId: node.id, title: `No ${config.collection} in this company`, detail: "The trigger is valid but will match nothing until a record exists." });
      }
    }
    if (node.type === "condition") {
      if (!config.left || !config.op) issues.push({ id: `cond-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no test`, detail: "A condition needs a field, an operator and, for most operators, a value." });
      const hasThen = graph.edges.some((edge) => edge.from === node.id && edge.port === "then");
      const hasElse = graph.edges.some((edge) => edge.from === node.id && edge.port === "else");
      if (!hasThen) issues.push({ id: `cond-then-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no true branch`, detail: "Connect the 'when true' port to the next step." });
      if (!hasElse) issues.push({ id: `cond-else-${node.id}`, severity: "warning", nodeId: node.id, title: `${node.label} has no false branch`, detail: "Runs that fail the test will finish here. That may be intended." });
    }
    if (node.type === "set" && (!config.name || !config.expr)) {
      issues.push({ id: `set-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no expression`, detail: "A variable node needs a name and an expression." });
    }
    if (node.type === "action") {
      if (!config.kind) issues.push({ id: `action-kind-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no action`, detail: "Choose what this step does." });
      if (config.kind === "provider.call") {
        const capability = config.capability ? capabilityById(config.capability) : undefined;
        if (!capability) issues.push({ id: `action-cap-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no capability`, detail: "Choose the provider capability this step would use." });
        else if (capability.state !== "verified_external") {
          issues.push({ id: `action-cap-state-${node.id}`, severity: "warning", nodeId: node.id, title: `${capability.label} is ${capability.state.replace(/_/g, " ")}`, detail: `${capability.note} The step will stop at the boundary and record that it did not run.` });
        }
      }
      if (config.kind === "record.create" && !config.target) {
        issues.push({ id: `action-target-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no destination`, detail: "Choose the collection the new record is written to." });
      }
    }
    if (node.type === "approval" && !config.approvers) {
      issues.push({ id: `approval-${node.id}`, severity: "error", nodeId: node.id, title: `${node.label} has no approver`, detail: "An approval gate needs a named approver or role." });
    }
  }
  for (const edge of graph.edges) {
    if (!graph.nodes.some((node) => node.id === edge.from) || !graph.nodes.some((node) => node.id === edge.to)) {
      issues.push({ id: `dangling-${edge.id ?? `${edge.from}-${edge.to}`}`, severity: "error", title: "Connection points at a missing node", detail: "Delete the connection or re-add the node." });
    }
  }
  const cycles = findCycles(graph);
  const limits = { ...DEFAULT_LIMITS, ...(graph.limits ?? {}) };
  for (const cycle of cycles) {
    const named = cycle.map((id) => graph.nodes.find((node) => node.id === id)?.label ?? id).join(" → ");
    issues.push({
      id: `cycle-${cycle.join("-")}`,
      severity: limits.maxVisits && limits.maxSteps ? "warning" : "error",
      nodeId: cycle[0],
      title: "This graph contains a loop",
      detail: `${named}. The interpreter allows ${limits.maxVisits} visits per node and ${limits.maxSteps} steps in total, then stops the run as failed. Set the limits on the Parameters tab.`,
    });
  }
  return issues;
}

/* ------------------------------ bindings ------------------------------ */

export type Bindings = Record<string, unknown>;

export function resolvePath(bindings: Bindings, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = bindings;
  for (const part of parts) {
    if (Array.isArray(current)) {
      current = current.map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>)[part] : undefined));
      continue;
    }
    if (current && typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
      continue;
    }
    return undefined;
  }
  return current;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

/** `{path}` interpolation for titles and summaries. */
export function interpolate(template: string, bindings: Bindings): string {
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_match, path: string) => {
    const value = resolvePath(bindings, path);
    if (value === undefined || value === null) return "(unavailable)";
    if (Array.isArray(value)) return String(value.length);
    return String(value);
  });
}

export class ExpressionError extends Error {}

/**
 * A deliberately small expression language: a number, a binding path, one of
 * four aggregate functions over a path, or a binding combined with a number by
 * one arithmetic operator. Anything else is an error, not a guess.
 */
export function evaluateExpression(expr: string, bindings: Bindings): number {
  const text = expr.trim();
  if (text === "") throw new ExpressionError("The expression is empty.");
  const literal = toNumber(text);
  if (literal !== undefined) return literal;

  const call = text.match(/^(sum|count|avg|max)\(\s*([a-zA-Z0-9_.]+)\s*\)$/);
  if (call) {
    const [, fn, path] = call;
    const raw = resolvePath(bindings, path);
    const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    if (fn === "count") return list.filter((item) => item !== undefined && item !== null).length;
    const numbers = list.map(toNumber).filter((value): value is number => value !== undefined);
    if (numbers.length === 0) {
      if (fn === "sum") return 0;
      throw new ExpressionError(`${fn}(${path}) has no numeric values to work from.`);
    }
    if (fn === "sum") return numbers.reduce((total, value) => total + value, 0);
    if (fn === "avg") return numbers.reduce((total, value) => total + value, 0) / numbers.length;
    return Math.max(...numbers);
  }

  const binary = text.match(/^([a-zA-Z0-9_.]+)\s*([*+/-])\s*(-?[0-9.]+)$/);
  if (binary) {
    const [, path, operator, rightRaw] = binary;
    const left = toNumber(resolvePath(bindings, path));
    const right = Number(rightRaw);
    if (left === undefined) throw new ExpressionError(`${path} is not a number in this run.`);
    if (operator === "*") return left * right;
    if (operator === "+") return left + right;
    if (operator === "-") return left - right;
    if (right === 0) throw new ExpressionError("Division by zero.");
    return left / right;
  }

  const direct = toNumber(resolvePath(bindings, text));
  if (direct !== undefined) return direct;
  throw new ExpressionError(`${text} did not resolve to a number. Use a field path, a number, or sum/count/avg/max of a path.`);
}

export function evaluateCondition(
  config: WfNodeConfig,
  bindings: Bindings,
  now: Date,
): { value: boolean; left: unknown; detail: string } {
  const path = config.left ?? "";
  const op = config.op ?? "eq";
  const left = resolvePath(bindings, path);
  const right = config.right ?? "";
  const leftText = Array.isArray(left) ? `${left.length} values` : left === undefined ? "(missing)" : String(left);

  if (op === "isEmpty") {
    const value = left === undefined || left === null || left === "" || (Array.isArray(left) && left.length === 0);
    return { value, left, detail: `${path} is ${value ? "empty" : `set to ${leftText}`}` };
  }
  if (op === "isTrue") {
    const value = left === true || left === "true" || left === 1;
    return { value, left, detail: `${path} is ${value}` };
  }
  if (op === "olderThanDays") {
    const days = Number(right);
    if (!Number.isFinite(days)) return { value: false, left, detail: `${right} is not a number of days.` };
    const date = typeof left === "string" || left instanceof Date ? new Date(left as string) : undefined;
    if (!date || Number.isNaN(date.getTime())) return { value: false, left, detail: `${path} is not a date, so the age could not be computed.` };
    const age = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
    return { value: age > days, left, detail: `${path} is ${age} days old against a threshold of ${days}` };
  }
  if (op === "contains") {
    const value = String(left ?? "").toLowerCase().includes(right.toLowerCase());
    return { value, left, detail: `${leftText} ${value ? "contains" : "does not contain"} ${right}` };
  }
  if (op === "eq" || op === "neq") {
    const leftNumber = toNumber(left);
    const rightNumber = toNumber(right);
    const same = leftNumber !== undefined && rightNumber !== undefined
      ? leftNumber === rightNumber
      : String(left ?? "").toLowerCase() === right.toLowerCase();
    const value = op === "eq" ? same : !same;
    return { value, left, detail: `${leftText} ${op === "eq" ? "=" : "≠"} ${right} → ${value}` };
  }
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber === undefined || rightNumber === undefined) {
    return { value: false, left, detail: `${leftText} and ${right} cannot be compared as numbers, so the test is false.` };
  }
  const value =
    op === "gt" ? leftNumber > rightNumber
      : op === "gte" ? leftNumber >= rightNumber
        : op === "lt" ? leftNumber < rightNumber
          : leftNumber <= rightNumber;
  const symbol = op === "gt" ? ">" : op === "gte" ? "≥" : op === "lt" ? "<" : "≤";
  return { value, left, detail: `${leftNumber} ${symbol} ${rightNumber} → ${value}` };
}

/* ------------------------------ run model ------------------------------ */

export type StepStatus = "ok" | "skipped" | "waiting" | "blocked" | "failed";

export interface Attempt {
  n: number;
  at: string;
  outcome: "ok" | "failed" | "blocked";
  message: string;
  backoffSeconds: number;
}

export interface PendingWrite {
  op: "create" | "patch" | "tag" | "log";
  collection?: string;
  id?: string;
  title?: string;
  status?: string;
  summary?: string;
  amountMinor?: number;
  parentId?: string;
  tag?: string;
  fields?: Record<string, string | number | boolean>;
}

export interface StepResult {
  index: number;
  nodeId: string;
  nodeType: NodeKind;
  label: string;
  status: StepStatus;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  attempts: Attempt[];
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  message: string;
  receipt: string;
  writes: PendingWrite[];
  sensitive: boolean;
  capability?: { id: string; label: string; state: CapabilityState; localEquivalent: string; note: string };
  branch?: PortId;
}

export type RunStatus = "completed" | "failed" | "waiting_approval" | "blocked" | "cancelled";

export interface RunRequest {
  graph: WorkflowGraph;
  records: Rec[];
  now: Date;
  actor: string;
  mode: "live" | "dry";
  /** nodeId → decision; an approval gate without a decision stops the run. */
  decisions?: Record<string, "approved" | "rejected">;
  /** Dry-run fixture values merged over the trigger payload. */
  fixture?: Record<string, string | number | boolean>;
  resume?: { steps: StepResult[]; variables: Bindings };
}

export interface RunResult {
  status: RunStatus;
  mode: "live" | "dry";
  steps: StepResult[];
  variables: Bindings;
  writes: PendingWrite[];
  cursor?: string;
  waitingOn?: { nodeId: string; label: string; approvers: string };
  startedAt: string;
  endedAt: string;
  durationMs: number;
  budget: { used: number; max: number; visits: Record<string, number> };
  message: string;
  branchesTaken: string[];
}

/** Stable, non-cryptographic receipt so a step can be checked twice. */
export function receiptFor(parts: unknown[]): string {
  const text = parts.map((part) => (typeof part === "string" ? part : JSON.stringify(part) ?? "")).join("|");
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `rcpt_${hash.toString(16).padStart(8, "0")}`;
}

function projectRecord(record: Rec): Record<string, unknown> {
  return {
    id: record.id,
    title: record.title,
    status: record.status,
    summary: record.summary,
    collection: record.collection,
    amountMinor: record.amountMinor,
    currency: record.currency,
    owner: record.ownerName,
    dueAt: record.dueAt,
    at: record.at,
    updatedAt: record.updatedAt,
    tags: record.tags,
    ...record.fields,
  };
}

export function matchTrigger(config: WfNodeConfig, records: Rec[], now: Date): Rec[] {
  const collection = config.collection;
  if (!collection) return [];
  let pool = records.filter((record) => record.collection === collection);
  if (config.event === "record.overdue") {
    pool = pool.filter((record) => record.dueAt && new Date(record.dueAt) < now && !["paid", "void", "done", "closed"].includes(record.status));
  }
  for (const filter of config.filters ?? []) {
    if (!filter.field || !filter.op) continue;
    pool = pool.filter((record) => evaluateCondition(
      { left: filter.field, op: filter.op, right: filter.value },
      { record: projectRecord(record) },
      now,
    ).value);
  }
  return pool;
}

const STEP_MS = 140;

export function runWorkflow(request: RunRequest): RunResult {
  const { graph, records, now, mode } = request;
  const limits = { ...DEFAULT_LIMITS, ...(graph.limits ?? {}) };
  const steps: StepResult[] = request.resume ? [...request.resume.steps] : [];
  const variables: Bindings = request.resume ? { ...request.resume.variables } : {};
  const writes: PendingWrite[] = steps.flatMap((step) => step.writes);
  const visits: Record<string, number> = {};
  for (const step of steps) visits[step.nodeId] = (visits[step.nodeId] ?? 0) + 1;
  const branchesTaken: string[] = [];
  const startMs = now.getTime();
  let clock = startMs + steps.length * STEP_MS;
  const startedAt = new Date(startMs).toISOString();

  const entry = entryNode(graph);
  if (!entry) {
    return {
      status: "failed", mode, steps, variables, writes,
      startedAt, endedAt: startedAt, durationMs: 0,
      budget: { used: 0, max: limits.maxSteps, visits },
      message: "The graph has no nodes, so there was nothing to run.",
      branchesTaken,
    };
  }

  let currentId: string | undefined = request.resume
    ? nextNodeId(graph, steps[steps.length - 1]?.nodeId ?? entry.id, steps[steps.length - 1]?.branch ?? "out")
    : entry.id;

  // Resuming an approval: the gate itself is re-evaluated with the decision.
  if (request.resume) {
    const last = steps[steps.length - 1];
    if (last && last.status === "waiting") {
      steps.pop();
      currentId = last.nodeId;
    }
  }

  let status: RunStatus = "completed";
  let message = "Every step on the chosen path finished.";
  let waitingOn: RunResult["waitingOn"];
  let cursor: string | undefined;

  while (currentId) {
    if (steps.length >= limits.maxSteps) {
      status = "failed";
      message = `The run stopped after ${limits.maxSteps} steps. The step limit on the Parameters tab guards against an unbounded loop.`;
      cursor = currentId;
      break;
    }
    const node = graph.nodes.find((item) => item.id === currentId);
    if (!node) {
      status = "failed";
      message = `The run pointed at a node (${currentId}) that is not in the graph.`;
      break;
    }
    visits[node.id] = (visits[node.id] ?? 0) + 1;
    if (visits[node.id] > limits.maxVisits) {
      status = "failed";
      message = `${node.label} was reached ${visits[node.id]} times, over the ${limits.maxVisits}-visit limit. The loop was stopped rather than run forever.`;
      cursor = node.id;
      break;
    }

    const stepStart = clock;
    clock += STEP_MS;
    const bindings: Bindings = { ...variables, now: now.toISOString() };
    const step = executeNode({ node, bindings, records, now, mode, request, index: steps.length, startMs: stepStart, endMs: clock });
    steps.push(step);
    for (const [key, value] of Object.entries(step.output)) {
      if (key === "_vars" && value && typeof value === "object") Object.assign(variables, value as Bindings);
    }
    if (step.output._bind && typeof step.output._bind === "object") Object.assign(variables, step.output._bind as Bindings);
    writes.push(...step.writes);

    if (step.status === "waiting") {
      status = "waiting_approval";
      cursor = node.id;
      waitingOn = { nodeId: node.id, label: node.label, approvers: String(node.config?.approvers ?? "the owner") };
      message = `${node.label} is waiting for ${waitingOn.approvers}. Nothing after this gate has run.`;
      break;
    }
    if (step.status === "failed" && (node.config?.onError ?? "halt") === "halt") {
      status = "failed";
      cursor = node.id;
      message = `${node.label} failed after ${step.attempts.length} attempt${step.attempts.length === 1 ? "" : "s"}: ${step.message}`;
      break;
    }
    if (step.status === "blocked" && node.type === "action" && (node.config?.onError ?? "halt") === "halt") {
      status = "blocked";
      cursor = node.id;
      message = step.message;
      break;
    }

    const port = step.branch ?? "out";
    if (step.branch) branchesTaken.push(`${node.label} → ${step.branch}`);
    const next = nextNodeId(graph, node.id, port);
    if (!next) {
      if (step.status === "failed") {
        status = "failed";
        message = `${node.label} failed and the path ended there: ${step.message}`;
      } else if (port === "else" || port === "rejected") {
        message = `The run finished on the ${port === "else" ? "false" : "rejected"} branch of ${node.label}.`;
      }
      currentId = undefined;
      break;
    }
    currentId = next;
  }

  const endedAt = new Date(clock).toISOString();
  return {
    status, mode, steps, variables, writes, cursor, waitingOn,
    startedAt, endedAt, durationMs: clock - startMs,
    budget: { used: steps.length, max: limits.maxSteps, visits },
    message, branchesTaken,
  };
}

function nextNodeId(graph: WorkflowGraph, from: string, port: PortId): string | undefined {
  const exact = graph.edges.find((edge) => edge.from === from && (edge.port ?? "out") === port);
  if (exact) return exact.to;
  if (port === "out") return graph.edges.find((edge) => edge.from === from)?.to;
  return undefined;
}

interface ExecuteInput {
  node: WfNode;
  bindings: Bindings;
  records: Rec[];
  now: Date;
  mode: "live" | "dry";
  request: RunRequest;
  index: number;
  startMs: number;
  endMs: number;
}

function executeNode(input: ExecuteInput): StepResult {
  const { node, records, now, mode, request, index, startMs, endMs } = input;
  const config = node.config ?? {};
  const base = {
    index,
    nodeId: node.id,
    nodeType: node.type,
    label: node.label,
    startedAt: new Date(startMs).toISOString(),
    endedAt: new Date(endMs).toISOString(),
    durationMs: endMs - startMs,
    sensitive: Boolean(config.sensitive),
  };
  const attempts: Attempt[] = [];
  const retries = Math.max(0, Math.min(5, Number(config.retries ?? 0)));

  function finish(
    partial: { status: StepStatus; input: Record<string, unknown>; output: Record<string, unknown>; message: string; writes?: PendingWrite[]; branch?: PortId; capability?: StepResult["capability"] },
  ): StepResult {
    return {
      ...base,
      status: partial.status,
      attempts: attempts.length ? attempts : [{ n: 1, at: base.startedAt, outcome: partial.status === "ok" || partial.status === "skipped" ? "ok" : partial.status === "blocked" ? "blocked" : "failed", message: partial.message, backoffSeconds: 0 }],
      input: partial.input,
      output: partial.output,
      message: partial.message,
      receipt: receiptFor([node.id, index, partial.input, partial.output, partial.status]),
      writes: partial.writes ?? [],
      capability: partial.capability,
      branch: partial.branch,
    };
  }

  if (node.type === "trigger") {
    const matched = matchTrigger(config, records, now);
    const fixture = { ...(request.graph.fixture ?? {}), ...(request.fixture ?? {}) };
    const first = matched[0] ? projectRecord(matched[0]) : undefined;
    const record = mode === "dry" && Object.keys(fixture).length > 0 ? { ...(first ?? {}), ...fixture } : first;
    const stepInput = { collection: config.collection ?? "(none)", event: config.event ?? "record.matches", timezone: config.timezone ?? "UTC", fixtureApplied: mode === "dry" && Object.keys(fixture).length > 0 };
    if (!record) {
      return finish({
        status: "failed",
        input: stepInput,
        output: { matched: 0 },
        message: config.collection
          ? `No ${config.collection} record matched this trigger, so there was nothing to work on.`
          : "The trigger has no collection configured.",
      });
    }
    const overdueDays = record.dueAt ? Math.max(0, Math.floor((now.getTime() - new Date(String(record.dueAt)).getTime()) / 86_400_000)) : 0;
    return finish({
      status: "ok",
      input: stepInput,
      output: {
        matched: matched.length,
        recordId: record.id,
        recordTitle: record.title,
        _bind: {
          record,
          overdueDays,
          trigger: {
            collection: config.collection,
            event: config.event ?? "record.matches",
            count: matched.length,
            matched: matched.map(projectRecord),
            at: now.toISOString(),
          },
        },
      },
      message: `${matched.length} ${config.collection} record${matched.length === 1 ? "" : "s"} matched. ${record.title} is bound to this run.`,
    });
  }

  if (node.type === "condition") {
    const result = evaluateCondition(config, input.bindings, now);
    return finish({
      status: "ok",
      input: { field: config.left ?? "(none)", operator: config.op ?? "(none)", value: config.right ?? "", observed: result.left ?? null },
      output: { result: result.value },
      message: result.detail,
      branch: result.value ? "then" : "else",
    });
  }

  if (node.type === "set") {
    const name = config.name ?? "value";
    try {
      const value = evaluateExpression(config.expr ?? "", input.bindings);
      return finish({
        status: "ok",
        input: { name, expression: config.expr ?? "" },
        output: { [name]: value, _bind: { [name]: value } },
        message: `${config.expr} evaluated to ${value}, bound as ${name}.`,
      });
    } catch (error) {
      const text = error instanceof Error ? error.message : "The expression could not be evaluated.";
      for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        attempts.push({ n: attempt, at: new Date(startMs + attempt * 1000).toISOString(), outcome: "failed", message: text, backoffSeconds: attempt === 1 ? 0 : 2 ** (attempt - 1) });
      }
      return finish({ status: "failed", input: { name, expression: config.expr ?? "" }, output: {}, message: text });
    }
  }

  if (node.type === "delay") {
    const minutes = Number(config.minutes ?? 0);
    return finish({
      status: "ok",
      input: { minutes },
      output: { resumeAt: new Date(endMs + minutes * 60_000).toISOString() },
      message: `A real scheduler would hold the run for ${minutes} minutes. Here the delay is recorded and the run continues immediately, so the trace stays honest about what was simulated.`,
    });
  }

  if (node.type === "approval") {
    const decision = request.decisions?.[node.id];
    const approvers = config.approvers ?? "the owner";
    if (!decision) {
      return finish({
        status: "waiting",
        input: { approvers, requestedAt: base.startedAt },
        output: { decision: null },
        message: `Waiting for ${approvers}. The run is paused here; no later step has run.`,
      });
    }
    return finish({
      status: "ok",
      input: { approvers, decidedBy: request.actor },
      output: { decision, _bind: { approval: { nodeId: node.id, decision, by: request.actor, at: base.endedAt } } },
      message: `${request.actor} recorded ${decision} for ${approvers}.`,
      branch: decision === "approved" ? "approved" : "rejected",
    });
  }

  /* action */
  const kind = config.kind;
  const bindings = input.bindings;
  if (!kind) {
    return finish({ status: "failed", input: {}, output: {}, message: "This action has no kind configured, so nothing could be attempted." });
  }

  if (config.impact === "high" && mode === "dry") {
    return finish({
      status: "blocked",
      input: { kind, impact: "high", mode },
      output: { executed: false },
      message: `${node.label} is marked high impact and the run is a dry run, so it was not executed. High-impact steps only run from a live run with a recorded approval.`,
    });
  }

  if (kind === "provider.call") {
    const capability = config.capability ? capabilityById(config.capability) : undefined;
    if (!capability) {
      return finish({ status: "failed", input: { kind }, output: {}, message: "No provider capability is chosen for this step." });
    }
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      attempts.push({
        n: attempt,
        at: new Date(startMs + (attempt - 1) * 1000).toISOString(),
        outcome: "blocked",
        message: `${capability.provider} is ${capability.state.replace(/_/g, " ")}; the call was not attempted.`,
        backoffSeconds: attempt === 1 ? 0 : 2 ** (attempt - 1),
      });
      if (capability.state === "verified_external") break;
    }
    return finish({
      status: "blocked",
      input: { kind, capability: capability.id, provider: capability.provider, payloadKeys: Object.keys(bindings).filter((key) => key !== "now") },
      output: { executed: false, delivered: false, keptLocally: capability.localEquivalent },
      message: `Stopped at the provider boundary. ${capability.label} is ${capability.state.replace(/_/g, " ")}, so this step did not run. ${capability.localEquivalent}`,
      capability: { id: capability.id, label: capability.label, state: capability.state, localEquivalent: capability.localEquivalent, note: capability.note },
      writes: [{ op: "log", summary: `${node.label}: ${capability.label} not attempted (${capability.state}). Nothing left this browser.` }],
    });
  }

  if (kind === "log.note") {
    const text = interpolate(config.summaryExpr ?? node.label, bindings);
    return finish({
      status: "ok",
      input: { kind, template: config.summaryExpr ?? node.label },
      output: { note: text },
      message: mode === "dry" ? `Would write to the activity log: ${text}` : `Wrote to the activity log: ${text}`,
      writes: mode === "live" ? [{ op: "log", summary: text }] : [],
    });
  }

  if (kind === "record.create") {
    const target = config.target;
    if (!target) return finish({ status: "failed", input: { kind }, output: {}, message: "No destination collection is chosen." });
    const title = interpolate(config.titleExpr ?? node.label, bindings);
    const summary = interpolate(config.summaryExpr ?? "", bindings);
    if (title.includes("(unavailable)")) {
      for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        attempts.push({ n: attempt, at: new Date(startMs + (attempt - 1) * 1000).toISOString(), outcome: "failed", message: "A field in the title template did not resolve.", backoffSeconds: attempt === 1 ? 0 : 2 ** (attempt - 1) });
      }
      return finish({ status: "failed", input: { kind, target, titleTemplate: config.titleExpr ?? "" }, output: { title }, message: `The title template refers to a field that is not bound in this run (${config.titleExpr}). Retrying produced the same result, because the interpreter is deterministic.` });
    }
    const parentId = typeof resolvePath(bindings, "record.id") === "string" ? String(resolvePath(bindings, "record.id")) : undefined;
    const write: PendingWrite = {
      op: "create",
      collection: target,
      title,
      status: "draft",
      summary,
      parentId,
      fields: { createdByWorkflowNode: node.id, kind: "automation" },
    };
    return finish({
      status: "ok",
      input: { kind, target, titleTemplate: config.titleExpr ?? "", summaryTemplate: config.summaryExpr ?? "" },
      output: { title, summary, parentId: parentId ?? null },
      message: mode === "dry" ? `Would create a ${target} record titled “${title}”. A dry run writes nothing.` : `Created a ${target} record titled “${title}”.`,
      writes: mode === "live" ? [write] : [],
    });
  }

  if (kind === "record.patch" || kind === "record.tag") {
    const id = resolvePath(bindings, "record.id");
    if (typeof id !== "string") {
      for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
        attempts.push({ n: attempt, at: new Date(startMs + (attempt - 1) * 1000).toISOString(), outcome: "failed", message: "No record is bound to this step.", backoffSeconds: attempt === 1 ? 0 : 2 ** (attempt - 1) });
      }
      return finish({ status: "failed", input: { kind }, output: {}, message: "No record is bound to this step, so there was nothing to update. A trigger or an earlier step must bind record.id." });
    }
    const record = records.find((item) => item.id === id);
    if (!record) {
      return finish({ status: "failed", input: { kind, id }, output: {}, message: `${id} is no longer in this workspace.` });
    }
    const write: PendingWrite = kind === "record.tag"
      ? { op: "tag", id, tag: config.tag ?? "automated" }
      : { op: "patch", id, status: config.target ?? record.status, fields: { lastWorkflowNode: node.id } };
    return finish({
      status: "ok",
      input: { kind, id, from: record.status },
      output: kind === "record.tag" ? { tag: config.tag ?? "automated" } : { status: write.status },
      message: mode === "dry"
        ? `Would ${kind === "record.tag" ? `tag ${record.title} with ${config.tag ?? "automated"}` : `move ${record.title} to ${write.status}`}. A dry run writes nothing.`
        : `${kind === "record.tag" ? `Tagged ${record.title}` : `Moved ${record.title} to ${write.status}`}.`,
      writes: mode === "live" ? [write] : [],
    });
  }

  return finish({ status: "failed", input: { kind }, output: {}, message: `${kind} is not an action this interpreter implements.` });
}

/* ------------------------------ assertions ------------------------------ */

export interface AssertionResult {
  assertion: WfAssertion;
  pass: boolean;
  observed: string;
  detail: string;
}

export function evaluateAssertions(graph: WorkflowGraph, run: RunResult, now: Date): AssertionResult[] {
  return (graph.assertions ?? []).map((assertion) => {
    if (assertion.subject === "status") {
      const step = run.steps.find((item) => item.nodeId === assertion.nodeId);
      const observed = step?.status ?? "not reached";
      const result = evaluateCondition({ left: "observed", op: assertion.op, right: assertion.value ?? "" }, { observed }, now);
      return { assertion, pass: result.value, observed, detail: result.detail };
    }
    const name = assertion.name ?? "";
    const observed = run.variables[name];
    const result = evaluateCondition({ left: "observed", op: assertion.op, right: assertion.value ?? "" }, { observed }, now);
    return { assertion, pass: result.value, observed: observed === undefined ? "unbound" : String(observed), detail: result.detail };
  });
}

/* ------------------------------ retry safety ------------------------------ */

export type RetrySafety = "safe" | "unknown" | "not_retryable";

export interface RetryAssessment {
  step: StepResult;
  safety: RetrySafety;
  reason: string;
}

/**
 * A19/A06: a retry is only offered where the outcome of the first attempt is
 * known. A step that stopped at a provider boundary has a known outcome (it did
 * not run). A step that failed after a write is classified as unknown and must
 * be reconciled by a person before the run is retried.
 */
export function assessRetry(run: RunResult): RetryAssessment[] {
  return run.steps.map((step) => {
    if (step.status === "ok" && step.writes.length > 0) {
      return { step, safety: "unknown", reason: `This step wrote ${step.writes.length} record change${step.writes.length === 1 ? "" : "s"}. Running it again would repeat the write, so the record must be reconciled first.` };
    }
    if (step.status === "blocked" && step.capability) {
      return { step, safety: "safe", reason: `${step.capability.label} is ${step.capability.state.replace(/_/g, " ")}, so nothing was sent. Retrying cannot duplicate an external effect.` };
    }
    if (step.status === "failed" && step.writes.length === 0) {
      return { step, safety: "safe", reason: "The step failed before it changed anything, so a retry starts from the same state." };
    }
    if (step.nodeType === "approval") {
      return { step, safety: "not_retryable", reason: "An approval decision is a record of what a person chose. Ask for a new decision instead of replaying this step." };
    }
    return { step, safety: "safe", reason: "The step only read records, so replaying it has no side effect." };
  });
}

/* ------------------------------ storage shape ------------------------------ */

export interface StoredRun {
  graph: WorkflowGraph;
  result: RunResult;
  assertions?: AssertionResult[];
  trigger: string;
  workflowId: string;
  workflowTitle: string;
}

export function runStatusTone(status: RunStatus): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "waiting_approval") return "warning";
  if (status === "blocked") return "warning";
  return "neutral";
}

export function stepStatusTone(status: StepStatus): "success" | "danger" | "warning" | "info" | "neutral" {
  if (status === "ok") return "success";
  if (status === "failed") return "danger";
  if (status === "blocked") return "warning";
  if (status === "waiting") return "info";
  return "neutral";
}

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  completed: "Completed",
  failed: "Failed",
  waiting_approval: "Waiting for approval",
  blocked: "Blocked at a provider",
  cancelled: "Cancelled",
};
