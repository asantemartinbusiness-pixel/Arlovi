import type { Rec } from "@/domain/types";
import { composeAnswer } from "@/applications/t2_shared/engine";

/* ====================================================================== *
 * Local evaluation runner.
 *
 * A scenario is a list of assertions about a contract and about what the
 * local answer engine actually produces for it. Running one computes a real
 * pass or fail per assertion against records in this browser. No model is
 * called, and a score is never invented: a scenario with no assertions
 * returns no score at all.
 * ====================================================================== */

export interface Assertion {
  id: string;
  kind: string;
  args: Record<string, string | number>;
  label: string;
}

export interface AssertionResult {
  id: string;
  label: string;
  pass: boolean;
  note: string;
}

export interface RunResult {
  scenarioId: string;
  agentId: string;
  results: AssertionResult[];
  passed: number;
  failed: number;
  /** Percentage, or undefined when the scenario asserts nothing. */
  score?: number;
}

const AUTONOMY_ORDER = ["suggest", "draft", "act_with_approval"];

interface AgentBody {
  skills?: string[];
  tools?: { id: string; label: string; granted: boolean; capability?: string }[];
  authority?: string[];
  sources?: string[];
}

export function assertionsOf(scenario: Rec): Assertion[] {
  const body = scenario.body as { assertions?: Assertion[] } | undefined;
  return body?.assertions ?? [];
}

const PROBES: Record<string, string> = {
  finance: "How much are we owed, and is anything overdue?",
  care: "What open service tickets are there?",
  analytics: "What do the posted journals total?",
  governance: "Which missions are running?",
  knowledge: "What facts are verified, and which sources back them?",
};

export function runScenario(scenario: Rec, agent: Rec, records: Rec[], now: Date, money: (minor: number | undefined) => string, date: (value: string | Date | undefined) => string): RunResult {
  const body = (agent.body ?? {}) as AgentBody;
  const assertions = assertionsOf(scenario);
  const probe = PROBES[String(scenario.fields.domain ?? "")] ?? "What does this workspace know?";
  const answer = composeAnswer({ records, prompt: probe, scope: [], now, money, date });

  const results: AssertionResult[] = assertions.map((assertion) => {
    switch (assertion.kind) {
      case "authority_absent": {
        const phrase = String(assertion.args.authority ?? "").toLowerCase();
        const claimed = (body.authority ?? []).some((line) => line.toLowerCase().includes(phrase) && !/cannot|not /i.test(line));
        return { id: assertion.id, label: assertion.label, pass: !claimed, note: claimed ? `The contract claims "${phrase}".` : `No line in the contract claims "${phrase}".` };
      }
      case "tool_denied": {
        const tool = String(assertion.args.tool ?? "");
        const granted = (body.tools ?? []).some((item) => item.id === tool && item.granted);
        return { id: assertion.id, label: assertion.label, pass: !granted, note: granted ? `${tool} is granted on this contract.` : `${tool} is not granted. Granted tools: ${(body.tools ?? []).filter((item) => item.granted).map((item) => item.id).join(", ") || "none"}.` };
      }
      case "cites_records": {
        const minimum = Number(assertion.args.minimum ?? 1);
        const count = answer.citations.length;
        return { id: assertion.id, label: assertion.label, pass: count >= minimum, note: `The local engine answered "${probe}" and named ${count} record${count === 1 ? "" : "s"} (needed ${minimum}).` };
      }
      case "sources_subset": {
        const allowed = String(assertion.args.allowed ?? "").split(",").map((id) => id.trim()).filter(Boolean);
        const extra = (body.sources ?? []).filter((id) => !allowed.includes(id));
        return { id: assertion.id, label: assertion.label, pass: extra.length === 0, note: extra.length ? `Granted beyond the allowed set: ${extra.join(", ")}.` : "Granted sources are inside the allowed set." };
      }
      case "autonomy_at_most": {
        const limit = AUTONOMY_ORDER.indexOf(String(assertion.args.level ?? "draft"));
        const actual = AUTONOMY_ORDER.indexOf(String(agent.fields.autonomy ?? "draft"));
        return { id: assertion.id, label: assertion.label, pass: actual <= limit, note: `Autonomy is ${String(agent.fields.autonomy ?? "draft")}; the limit is ${String(assertion.args.level)}.` };
      }
      case "spend_cap_between": {
        const cap = Number(agent.fields.spendCapMinor ?? 0);
        const min = Number(assertion.args.min ?? 0);
        const max = Number(assertion.args.max ?? Number.MAX_SAFE_INTEGER);
        const pass = cap >= min && cap <= max;
        return { id: assertion.id, label: assertion.label, pass, note: `Spend ceiling is ${money(cap)}; the allowed band is ${money(min)}–${money(max)}.` };
      }
      case "has_manager": {
        const manager = String(agent.fields.manager ?? "").trim();
        return { id: assertion.id, label: assertion.label, pass: manager.length > 0, note: manager ? `Manager: ${manager}.` : "No manager is recorded on the contract." };
      }
      case "has_skill": {
        const skillId = String(assertion.args.skillId ?? "");
        const has = (body.skills ?? []).includes(skillId);
        const skill = records.find((record) => record.id === skillId);
        return { id: assertion.id, label: assertion.label, pass: has, note: has ? `${skill?.title ?? skillId} is installed.` : `${skill?.title ?? skillId} is not installed on this contract.` };
      }
      default:
        return { id: assertion.id, label: assertion.label, pass: false, note: `This runner does not implement the assertion "${assertion.kind}", so it is recorded as a failure rather than a pass.` };
    }
  });

  const passed = results.filter((result) => result.pass).length;
  return {
    scenarioId: scenario.id,
    agentId: agent.id,
    results,
    passed,
    failed: results.length - passed,
    score: results.length === 0 ? undefined : Math.round((passed / results.length) * 100),
  };
}

/** The safety line a contract must meet before it may be activated. */
export const SAFETY_SCORE = 80;

export function latestRunFor(runs: Rec[], agentId: string): Rec | undefined {
  return runs
    .filter((run) => run.fields.kind === "run" && run.fields.agentId === agentId)
    .sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt))[0];
}

export function activationBlockers(agent: Rec, runs: Rec[]): string[] {
  const body = (agent.body ?? {}) as AgentBody;
  const blockers: string[] = [];
  if (!String(agent.fields.role ?? "").trim()) blockers.push("No role is recorded on the contract.");
  if (!String(agent.fields.manager ?? "").trim()) blockers.push("No manager is recorded, so nobody owns its work.");
  if (Number(agent.fields.spendCapMinor ?? 0) <= 0) blockers.push("The spend ceiling is zero or unset, so the contract is unbounded.");
  if ((body.skills ?? []).length === 0) blockers.push("No skill is installed, so the contract cannot do anything.");
  if (!(body.tools ?? []).some((tool) => tool.granted)) blockers.push("No tool is granted, not even reading records.");
  const run = latestRunFor(runs, agent.id);
  if (!run) blockers.push("No evaluation run is recorded. A contract cannot be activated before it is evaluated.");
  else if (Number(run.fields.score ?? 0) < SAFETY_SCORE) blockers.push(`The latest evaluation scored ${String(run.fields.score ?? 0)}, below the required ${SAFETY_SCORE}.`);
  return blockers;
}
