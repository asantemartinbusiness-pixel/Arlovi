import type { Rec } from "@/domain/types";
import { capabilityById } from "@/platform/capability";

/* ====================================================================== *
 * Local mission interpreter.
 *
 * Audit A19: execution was a status string. A step here is a record with an
 * operation, and running it performs that operation against the records in
 * this browser. A step that would touch an external service stops at the
 * provider boundary and records the capability state and the reason; it is
 * never reported as done.
 * ====================================================================== */

export type StepKind = "read" | "compute" | "draft" | "approval" | "provider";

export type StepState = "todo" | "ready" | "running" | "done" | "blocked" | "awaiting_approval" | "failed" | "unknown_side_effect";

export interface StepResult {
  state: StepState;
  /** What the step produced, in words, from the records it read. */
  output: string;
  reason?: string;
  /** Ids of the records the step read. */
  read: string[];
  capability?: string;
  /** A record the step wants created, for draft operations. */
  create?: { collection: string; title: string; summary: string; text: string };
}

export interface RunContext {
  records: Rec[];
  mission: Rec;
  money: (minor: number | undefined) => string;
  date: (value: string | Date | undefined) => string;
  now: Date;
}

const of = (records: Rec[], collection: string) => records.filter((record) => record.collection === collection);

export const OPERATIONS: { id: string; label: string; kind: StepKind; capability?: string; note: string }[] = [
  { id: "collect.products", label: "Read the product records", kind: "read", note: "Lists products and their recorded prices." },
  { id: "collect.open_invoices", label: "Collect open invoices", kind: "read", note: "Invoices that are not paid, void or draft." },
  { id: "collect.open_tickets", label: "Collect open service tickets", kind: "read", note: "Tickets that are not resolved." },
  { id: "collect.sources", label: "Read registered sources", kind: "read", note: "Sources with their freshness dates." },
  { id: "compute.budget_headroom", label: "Compute budget headroom", kind: "compute", note: "Mission ceiling less committed, from the cost records." },
  { id: "compute.price_check", label: "Check prices against the registry", kind: "compute", note: "Compares product prices with verified facts." },
  { id: "draft.campaign_copy", label: "Draft the campaign copy", kind: "draft", note: "Writes a draft document from products and the pricing decision." },
  { id: "draft.supplier_note", label: "Draft the supplier note", kind: "draft", note: "Writes a draft note from recorded supplier terms." },
  { id: "approval.owner", label: "Owner approval gate", kind: "approval", note: "Holds until a person with approval authority decides." },
  { id: "provider.email_send", label: "Send email", kind: "provider", capability: "email.send", note: "Would need a mail provider." },
  { id: "provider.site_publish", label: "Publish a page", kind: "provider", capability: "site.publish", note: "Would need a hosting connection." },
  { id: "provider.price_feed", label: "Fetch a supplier price feed", kind: "provider", capability: "bank.feed", note: "Would need an external feed." },
  { id: "provider.model_inference", label: "Ask a language model", kind: "provider", capability: "model.inference", note: "Would need a model provider." },
];

export function operationFor(id: string) {
  return OPERATIONS.find((operation) => operation.id === id);
}

/** True when running the step again cannot repeat an external effect. */
export function isRetrySafe(step: Rec): boolean {
  const kind = String(step.fields.kind ?? "read") as StepKind;
  if (step.status === "unknown_side_effect") return false;
  return kind === "read" || kind === "compute" || kind === "draft";
}

export function blockedReason(step: Rec): string | undefined {
  if (step.status === "unknown_side_effect") {
    return "The last attempt ended with no recorded response, so the side effect is unknown. Reconcile it before any retry.";
  }
  if (String(step.fields.kind) === "approval" && step.status === "awaiting_approval") {
    return "This is an approval gate. A person with approval authority has to decide.";
  }
  return undefined;
}

export function runStep(step: Rec, context: RunContext): StepResult {
  const operationId = String(step.fields.operation ?? "");
  const operation = operationFor(operationId);
  const { records, mission, money, date } = context;

  if (!operation) {
    return {
      state: "failed",
      output: "",
      read: [],
      reason: `This step names ${operationId || "no operation"}, which the local interpreter does not implement. Nothing was run and no state was changed.`,
    };
  }

  if (operation.kind === "provider") {
    const capability = capabilityById(operation.capability ?? "");
    return {
      state: "blocked",
      output: "",
      read: [],
      capability: operation.capability,
      reason: capability
        ? `${capability.label} is ${capability.state.replace(/_/g, " ")}. ${capability.note} ${capability.localEquivalent}`
        : "The provider for this step is not connected, so nothing was attempted.",
    };
  }

  if (operation.kind === "approval") {
    return {
      state: "awaiting_approval",
      output: "",
      read: [mission.id],
      reason: "Held at the approval gate. The mission does not continue until a person with approval authority decides.",
    };
  }

  switch (operation.id) {
    case "collect.products": {
      const products = of(records, "products");
      return {
        state: "done",
        read: products.map((product) => product.id),
        output: products.length
          ? `${products.length} product records read: ${products.map((product) => `${product.title} (${money(product.amountMinor)})`).join(", ")}.`
          : "No product records exist in this workspace, so the step produced an empty list rather than an invented one.",
      };
    }
    case "collect.open_invoices": {
      const open = of(records, "invoices").filter((invoice) => !["paid", "void", "draft"].includes(invoice.status));
      const total = open.reduce((sum, invoice) => sum + (invoice.amountMinor ?? 0), 0);
      return {
        state: "done",
        read: open.map((invoice) => invoice.id),
        output: open.length
          ? `${open.length} open invoices totalling ${money(total)}: ${open.map((invoice) => `${invoice.title} due ${date(invoice.dueAt)}`).join(", ")}.`
          : "No invoice is open.",
      };
    }
    case "collect.open_tickets": {
      const tickets = of(records, "tickets").filter((ticket) => ticket.status !== "resolved");
      return {
        state: "done",
        read: tickets.map((ticket) => ticket.id),
        output: tickets.length
          ? `${tickets.length} open tickets: ${tickets.map((ticket) => `${ticket.title} (${ticket.status})`).join(", ")}.`
          : "No ticket is open.",
      };
    }
    case "collect.sources": {
      const sources = of(records, "sources");
      const stale = sources.filter((source) => source.status !== "indexed");
      return {
        state: "done",
        read: sources.map((source) => source.id),
        output: `${sources.length} sources registered; ${stale.length} are not indexed (${stale.map((source) => `${source.title}: ${source.status}`).join("; ") || "none"}).`,
      };
    }
    case "compute.budget_headroom": {
      const costs = of(records, "missionCosts").filter((cost) => cost.fields.missionId === mission.id);
      const committed = costs.filter((cost) => cost.fields.kind === "commitment").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
      const spent = costs.filter((cost) => cost.fields.kind === "spend").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
      const ceiling = Number(mission.fields.budgetMinor ?? 0);
      return {
        state: "done",
        read: [mission.id, ...costs.map((cost) => cost.id)],
        output: `Ceiling ${money(ceiling)}; committed ${money(committed)}; spent ${money(spent)}; headroom ${money(ceiling - committed - spent)}. Provider cost is ${money(0)} because no provider is connected.`,
      };
    }
    case "compute.price_check": {
      const products = of(records, "products");
      const facts = of(records, "facts").filter((fact) => fact.fields.predicate === "trade price");
      const lines = products.map((product) => {
        const fact = facts.find((item) => String(item.fields.subject ?? "").toLowerCase() === product.title.toLowerCase());
        if (!fact) return `${product.title}: no verified price fact, so no comparison is claimed`;
        return `${product.title}: record ${money(product.amountMinor)} against fact ${String(fact.fields.value)} (${fact.status})`;
      });
      return {
        state: "done",
        read: [...products.map((product) => product.id), ...facts.map((fact) => fact.id)],
        output: lines.length ? lines.join("; ") : "No products to check.",
      };
    }
    case "draft.campaign_copy": {
      const products = of(records, "products");
      const decision = of(records, "decisions").find((item) => item.title.toLowerCase().includes("ex vat"));
      const text = [
        `${mission.title} — draft copy`,
        "",
        products.length
          ? `Products in scope: ${products.map((product) => `${product.title} at ${money(product.amountMinor)}`).join(", ")}.`
          : "No product records are in scope, so no product list is included.",
        decision ? `Pricing follows the approved decision: ${decision.title} — ${decision.summary}` : "No approved pricing decision was found, so pricing wording is left out.",
        "Nothing in this draft has been sent or published: this workspace has no mail or hosting connection.",
      ].join("\n");
      return {
        state: "done",
        read: [...products.map((product) => product.id), ...(decision ? [decision.id] : [])],
        output: `Draft written from ${products.length} product records${decision ? " and one approved decision" : ""}. It is a record in this workspace, not a sent message.`,
        create: { collection: "documents", title: `${mission.title} — draft copy`, summary: "Drafted by the local interpreter from workspace records.", text },
      };
    }
    case "draft.supplier_note": {
      const suppliers = of(records, "suppliers");
      const facts = of(records, "facts").filter((fact) => fact.fields.domain === "supply");
      const text = [
        `${mission.title} — supplier note`,
        "",
        `Recorded suppliers: ${suppliers.map((supplier) => supplier.title).join(", ") || "none"}.`,
        ...facts.map((fact) => `${String(fact.fields.subject)} — ${String(fact.fields.predicate)}: ${String(fact.fields.value)} (${fact.status}, source ${String(fact.fields.sourceId)})`),
        suppliers.length < 2 ? "A comparison is not possible: fewer than two suppliers are recorded." : "",
      ].filter(Boolean).join("\n");
      return {
        state: "done",
        read: [...suppliers.map((supplier) => supplier.id), ...facts.map((fact) => fact.id)],
        output: `Note drafted from ${suppliers.length} supplier record${suppliers.length === 1 ? "" : "s"} and ${facts.length} supply facts. ${suppliers.length < 2 ? "The gap is stated rather than filled." : ""}`,
        create: { collection: "documents", title: `${mission.title} — supplier note`, summary: "Drafted by the local interpreter from recorded supplier terms.", text },
      };
    }
    default:
      return { state: "failed", output: "", read: [], reason: `${operation.id} has no local implementation.` };
  }
}

/* --------------------------- plan graph helpers --------------------------- */

export function dependenciesOf(task: Rec): string[] {
  const body = task.body as { dependsOn?: string[] } | undefined;
  return Array.isArray(body?.dependsOn) ? body!.dependsOn! : [];
}

/** Returns the cycle it would create, or null when the edge is safe. */
export function wouldCycle(tasks: Rec[], from: string, to: string): string[] | null {
  const edges = new Map<string, string[]>();
  for (const task of tasks) edges.set(task.id, [...dependenciesOf(task)]);
  edges.set(to, [...(edges.get(to) ?? []), from]);
  const seen = new Set<string>();
  const path: string[] = [];
  function walk(node: string): string[] | null {
    if (path.includes(node)) return [...path.slice(path.indexOf(node)), node];
    if (seen.has(node)) return null;
    seen.add(node);
    path.push(node);
    for (const next of edges.get(node) ?? []) {
      const found = walk(next);
      if (found) return found;
    }
    path.pop();
    return null;
  }
  return walk(to);
}

/** Tasks whose dependencies are all verified or done. */
export function readyTasks(tasks: Rec[]): Rec[] {
  const done = new Set(tasks.filter((task) => ["verified", "done"].includes(String(task.fields.stage ?? task.status))).map((task) => task.id));
  return tasks.filter((task) => {
    const stage = String(task.fields.stage ?? task.status);
    if (["verified", "done", "running"].includes(stage)) return false;
    return dependenciesOf(task).every((id) => done.has(id));
  });
}

export const BOARD_LANES: { id: string; label: string; approvalGate?: boolean }[] = [
  { id: "todo", label: "To do" },
  { id: "ready", label: "Ready" },
  { id: "running", label: "Running" },
  { id: "review", label: "Review" },
  { id: "blocked", label: "Blocked" },
  { id: "verified", label: "Verified", approvalGate: true },
];
