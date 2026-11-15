import { useState } from "react";
import { Bot, GitBranch, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import {
  Button, Card, Empty, Field, Grid, Meter, Notice, Pill, Properties, Row, Select,
  Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import { CAPABILITY_LABELS, CAPABILITY_TONE, PROVIDER_CAPABILITIES, capabilityById } from "@/platform/capability";
import type { ScreenContext } from "@/platform/registry";
import { useRecord } from "@/platform/workspace";
import { ACTION_KINDS, findCycles, type WfNode, type WfNodeConfig } from "./engine";
import { setDraftGraph, updateDraft, useBuilderDraft } from "./store";
import { AUTOMATION_COLLECTIONS } from "./runner";
import { bindingsOf } from "./builder";
import { nodeSummary } from "./canvas";

function riskOf(node: WfNode): { tone: "danger" | "warning" | "success" | "info"; label: string; detail: string } {
  const config = node.config ?? {};
  if (config.kind === "provider.call") {
    return { tone: "danger", label: "Leaves the workspace", detail: "Would reach a third party. Stops at the provider boundary while nothing is connected." };
  }
  if (config.impact === "high") {
    return { tone: "danger", label: "High impact", detail: "Marked as moving money or reaching a person. Never executed from a dry run." };
  }
  if (config.kind === "record.create" || config.kind === "record.patch" || config.kind === "record.tag") {
    return { tone: "warning", label: "Writes a record", detail: "Changes a record in this company. A retry would repeat the write, so the run history marks it for reconciliation." };
  }
  if (config.kind === "log.note") {
    return { tone: "success", label: "Audit only", detail: "Appends an activity entry. Nothing else changes." };
  }
  return { tone: "info", label: "Not configured", detail: "This step has no action chosen, so it cannot run." };
}

function useActionContext(context: ScreenContext) {
  const record = useRecord(context.params.id);
  const draft = useBuilderDraft(record);
  return { record, draft };
}

export function ActionNodes({ context }: { context: ScreenContext }) {
  const { record, draft } = useActionContext(context);

  if (!record) {
    return (
      <Empty title="That automation is not in this company" icon={<Wrench size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows`)}>Back to the library</Button>}>
        Action configuration belongs to one automation.
      </Empty>
    );
  }
  if (!draft) return <Empty title="Opening the graph…" />;

  const graph = draft.graph;
  const actions = graph.nodes.filter((node) => node.type === "action");
  const aiNodes = actions.filter((node) => node.config?.capability === "model.inference");
  const approvals = graph.nodes.filter((node) => node.type === "approval");
  const conditions = graph.nodes.filter((node) => node.type === "condition");

  function patchNode(id: string, next: Partial<WfNodeConfig>, note: string) {
    setDraftGraph(record!.id, {
      ...graph,
      nodes: graph.nodes.map((node) => (node.id === id ? { ...node, config: { ...node.config, ...next } } : node)),
    }, note);
  }

  if (context.tab === "AI") {
    const model = capabilityById("model.inference")!;
    const authorised = PROVIDER_CAPABILITIES.filter((capability) => capability.state === "verified_external");
    return (
      <Grid>
        <Card span={7} title="AI steps in this graph" subtitle={`${aiNodes.length} step${aiNodes.length === 1 ? "" : "s"} name the model capability`}>
          <Stack gap={4}>
            <Notice tone="warning" title={`${model.label} — ${CAPABILITY_LABELS[model.state]}`}>
              {model.note} {model.localEquivalent} An AI step therefore stops at the boundary and records that it did not run; it never produces an invented answer.
            </Notice>
            {aiNodes.length === 0 ? (
              <Empty title="No AI step yet" icon={<Sparkles size={20} />}>
                An AI step is an action whose capability is the language model. Add one from the builder palette and choose that capability.
              </Empty>
            ) : (
              <Stack gap={2}>
                {aiNodes.map((node) => (
                  <Row key={node.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <div className="ds-grow">
                      <strong>{node.label}</strong>
                      <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{nodeSummary(node)}</p>
                    </div>
                    <Pill tone="warning" dot>would not run</Pill>
                  </Row>
                ))}
              </Stack>
            )}
          </Stack>
        </Card>

        <Card span={5} title="Tools an AI step may use" subtitle="Only capabilities that are verified externally">
          {authorised.length === 0 ? (
            <Empty title="No tool is authorised" icon={<Bot size={20} />}>
              Every capability in this workspace is unconnected, so an AI step has no tool it may call. The list fills in when a connection is verified.
            </Empty>
          ) : (
            <Properties rows={authorised.map((capability) => ({ label: capability.label, value: CAPABILITY_LABELS[capability.state] }))} />
          )}
          <Notice tone="info" title="Role views shape what is offered">
            This view is {context.role}. {context.can("manage_connectors") ? "It may change connections." : "It may not change connections."} Role views shape the interface and are not an account security boundary.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Approval") {
    return (
      <Grid>
        <Card span={7} title="Approval gates" subtitle={`${approvals.length} gate${approvals.length === 1 ? "" : "s"} in this graph`}>
          {approvals.length === 0 ? (
            <Empty title="No approval gate" icon={<ShieldCheck size={20} />}>
              A gate stops the run and keeps the steps after it unexecuted until a person decides. Add one from the builder palette.
            </Empty>
          ) : (
            <Stack gap={3}>
              {approvals.map((node) => {
                const approvedEdge = graph.edges.find((edge) => edge.from === node.id && edge.port === "approved");
                const rejectedEdge = graph.edges.find((edge) => edge.from === node.id && edge.port === "rejected");
                return (
                  <div key={node.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <Row gap={2}><strong className="ds-grow">{node.label}</strong><Pill tone={node.config?.approvers ? "success" : "danger"} dot>{node.config?.approvers ? "approver set" : "no approver"}</Pill></Row>
                    <Field label="Approver">
                      <TextInput
                        value={node.config?.approvers ?? ""}
                        onChange={(event) => patchNode(node.id, { approvers: event.target.value }, "Approver changed")}
                        placeholder="A person or a role"
                      />
                    </Field>
                    <Properties rows={[
                      { label: "When approved", value: approvedEdge ? graph.nodes.find((item) => item.id === approvedEdge.to)?.label ?? approvedEdge.to : "Run ends here" },
                      { label: "When rejected", value: rejectedEdge ? graph.nodes.find((item) => item.id === rejectedEdge.to)?.label ?? rejectedEdge.to : "Run ends here" },
                    ]} />
                  </div>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card span={5} title="Who can decide" subtitle="From the role view's capabilities">
          <Properties rows={[
            { label: "This view", value: context.role },
            { label: "May run automations", value: <Pill tone={context.can("run_automation") ? "success" : "warning"}>{context.can("run_automation") ? "yes" : "no"}</Pill> },
            { label: "May approve payment", value: <Pill tone={context.can("approve_payment") ? "success" : "warning"}>{context.can("approve_payment") ? "yes" : "no"}</Pill> },
            { label: "May manage connections", value: <Pill tone={context.can("manage_connectors") ? "success" : "warning"}>{context.can("manage_connectors") ? "yes" : "no"}</Pill> },
          ]} />
          <Notice tone="info" title="A gate is a real stop">
            The interpreter returns at the gate with a cursor. Steps after it have no result at all until a decision is recorded, which you can see in the run trace.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (context.tab === "Control flow") {
    const cycles = findCycles(graph);
    return (
      <Grid>
        <Card span={6} title="Conditions" subtitle={`${conditions.length} branch point${conditions.length === 1 ? "" : "s"}`}>
          {conditions.length === 0 ? (
            <Empty title="No condition" icon={<GitBranch size={20} />}>Every run takes the same path. A condition makes the path depend on the record.</Empty>
          ) : (
            <Stack gap={2}>
              {conditions.map((node) => {
                const thenEdge = graph.edges.find((edge) => edge.from === node.id && edge.port === "then");
                const elseEdge = graph.edges.find((edge) => edge.from === node.id && edge.port === "else");
                return (
                  <div key={node.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <strong>{node.label}</strong>
                    <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{nodeSummary(node)}</p>
                    <Properties rows={[
                      { label: "True →", value: thenEdge ? graph.nodes.find((item) => item.id === thenEdge.to)?.label ?? thenEdge.to : <Pill tone="danger">not connected</Pill> },
                      { label: "False →", value: elseEdge ? graph.nodes.find((item) => item.id === elseEdge.to)?.label ?? elseEdge.to : <Pill tone="warning">run ends</Pill> },
                    ]} />
                  </div>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card span={6} title="Loops and limits" subtitle="A cycle is allowed only with a limit">
          <Stack gap={4}>
            {cycles.length === 0
              ? <Notice tone="success" title="No cycle in this graph">Every path moves forward, so the run ends at a leaf.</Notice>
              : (
                <Notice tone="warning" title={`${cycles.length} cycle${cycles.length === 1 ? "" : "s"} found`}>
                  {cycles.map((cycle) => cycle.map((id) => graph.nodes.find((node) => node.id === id)?.label ?? id).join(" → ")).join("; ")}.
                  The interpreter stops the run as failed once the limits below are passed, so an unbounded loop cannot happen.
                </Notice>
              )}
            <Properties rows={[
              { label: "Step limit", value: String(graph.limits?.maxSteps ?? 40) },
              { label: "Visits per node", value: String(graph.limits?.maxVisits ?? 3) },
            ]} />
            <Meter value={graph.nodes.length} max={graph.limits?.maxSteps ?? 40} label="Nodes against the step limit" />
            <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${record.id}?tab=Parameters`)}>Change the limits</Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  /* Actions */
  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Action steps" value={String(actions.length)} meta={`${graph.nodes.length} nodes in total`} />
        <Stat label="Would leave the workspace" value={String(actions.filter((node) => node.config?.kind === "provider.call").length)} meta="Each one stops at the provider boundary" />
        <Stat label="High impact" value={String(actions.filter((node) => node.config?.impact === "high").length)} meta="Never executed from a dry run" />
        <Stat label="With retries" value={String(actions.filter((node) => Number(node.config?.retries ?? 0) > 0).length)} meta="Attempts and backoff are recorded per step" />
      </StatRow>

      {actions.length === 0 ? (
        <Empty title="No action step" icon={<Wrench size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/auto/workflows/${record.id}`)}>Open the builder</Button>}>
          An action writes a record, writes to the activity log, or calls a provider. Add one from the builder palette.
        </Empty>
      ) : (
        <Grid>
          {actions.map((node) => {
            const risk = riskOf(node);
            const capability = node.config?.capability ? capabilityById(node.config.capability) : undefined;
            return (
              <Card
                key={node.id}
                span={6}
                title={node.label}
                subtitle={ACTION_KINDS.find((kind) => kind.id === node.config?.kind)?.label ?? "No action chosen"}
                actions={<Pill tone={risk.tone} dot>{risk.label}</Pill>}
              >
                <Stack gap={3}>
                  <Field label="What this step does">
                    <Select value={node.config?.kind ?? ""} onChange={(event) => patchNode(node.id, { kind: event.target.value as WfNodeConfig["kind"] }, "Action kind changed")}>
                      <option value="">Choose an action</option>
                      {ACTION_KINDS.map((kind) => <option key={kind.id} value={kind.id}>{kind.label}</option>)}
                    </Select>
                  </Field>

                  {node.config?.kind === "provider.call" && (
                    <>
                      <Field label="Capability">
                        <Select value={node.config.capability ?? ""} onChange={(event) => patchNode(node.id, { capability: event.target.value }, "Capability changed")}>
                          <option value="">Choose a capability</option>
                          {PROVIDER_CAPABILITIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                        </Select>
                      </Field>
                      {capability && (
                        <Notice tone={CAPABILITY_TONE[capability.state] === "success" ? "success" : "warning"} title={`${capability.provider} — ${CAPABILITY_LABELS[capability.state]}`}>
                          {capability.localEquivalent}
                        </Notice>
                      )}
                    </>
                  )}

                  {node.config?.kind === "record.create" && (
                    <>
                      <Field label="Destination collection">
                        <Select value={node.config.target ?? ""} onChange={(event) => patchNode(node.id, { target: event.target.value }, "Destination changed")}>
                          <option value="">Choose a collection</option>
                          {AUTOMATION_COLLECTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Title mapping" hint="Braces insert a binding, for example {record.title}.">
                        <TextInput value={node.config.titleExpr ?? ""} onChange={(event) => patchNode(node.id, { titleExpr: event.target.value }, "Title mapping changed")} />
                      </Field>
                      <Field label="Summary mapping">
                        <TextInput value={node.config.summaryExpr ?? ""} onChange={(event) => patchNode(node.id, { summaryExpr: event.target.value }, "Summary mapping changed")} />
                      </Field>
                    </>
                  )}

                  {node.config?.kind === "log.note" && (
                    <Field label="Log line">
                      <TextInput value={node.config.summaryExpr ?? ""} onChange={(event) => patchNode(node.id, { summaryExpr: event.target.value }, "Log line changed")} />
                    </Field>
                  )}

                  <Row gap={2} wrap>
                    <Field label="Retries">
                      <Select value={String(node.config?.retries ?? 0)} onChange={(event) => patchNode(node.id, { retries: Number(event.target.value) }, "Retries changed")}>
                        {[0, 1, 2, 3, 5].map((count) => <option key={count} value={count}>{count}</option>)}
                      </Select>
                    </Field>
                    <Field label="On failure">
                      <Select value={node.config?.onError ?? "halt"} onChange={(event) => patchNode(node.id, { onError: event.target.value as "halt" | "continue" }, "Failure policy changed")}>
                        <option value="halt">Stop the run</option>
                        <option value="continue">Record and continue</option>
                      </Select>
                    </Field>
                    <Field label="Impact">
                      <Select value={node.config?.impact ?? "low"} onChange={(event) => patchNode(node.id, { impact: event.target.value as "low" | "high" }, "Impact changed")}>
                        <option value="low">Low</option>
                        <option value="high">High</option>
                      </Select>
                    </Field>
                  </Row>

                  <p className="ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{risk.detail}</p>

                  <Row gap={2} wrap>
                    <Button size="sm" variant="secondary" onClick={() => { updateDraft(record.id, { selectedNodeId: node.id }); context.openOverlay("Action parameter"); }}>Map fields</Button>
                    <Button size="sm" variant="ghost" onClick={() => { updateDraft(record.id, { selectedNodeId: node.id }); context.openOverlay("variable selector"); }}>Insert a variable</Button>
                    <Button size="sm" variant="ghost" onClick={() => { updateDraft(record.id, { selectedNodeId: node.id }); context.openOverlay("policy simulation"); }}>Inspect permission</Button>
                  </Row>
                </Stack>
              </Card>
            );
          })}
        </Grid>
      )}

      {draft.dirty && (
        <Notice tone="warning" title="Unsaved changes">
          {draft.lastNote}. Save the graph on the builder's Design tab; nothing is written to the record until then.
        </Notice>
      )}
    </Stack>
  );
}

/* ------------------------------ overlays ------------------------------ */

export function ActionParameter({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useActionContext(context);
  if (!record || !draft) return <Empty title="Open an automation first" />;
  const actions = draft.graph.nodes.filter((node) => node.type === "action");
  const node = actions.find((item) => item.id === draft.selectedNodeId) ?? actions[0];
  if (!node) return <Empty title="No action step to configure">Add an action node in the builder first.</Empty>;

  function patch(next: Partial<WfNodeConfig>, note: string) {
    setDraftGraph(record!.id, {
      ...draft!.graph,
      nodes: draft!.graph.nodes.map((item) => (item.id === node!.id ? { ...item, config: { ...item.config, ...next } } : item)),
    }, note);
  }

  return (
    <Stack gap={4}>
      <Field label="Step">
        <Select value={node.id} onChange={(event) => updateDraft(record.id, { selectedNodeId: event.target.value })}>
          {actions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Field label="Title mapping"><TextInput value={node.config?.titleExpr ?? ""} onChange={(event) => patch({ titleExpr: event.target.value }, "Title mapping changed")} /></Field>
      <Field label="Summary mapping"><TextInput value={node.config?.summaryExpr ?? ""} onChange={(event) => patch({ summaryExpr: event.target.value }, "Summary mapping changed")} /></Field>
      <Field label="Retries">
        <Select value={String(node.config?.retries ?? 0)} onChange={(event) => patch({ retries: Number(event.target.value) }, "Retries changed")}>
          {[0, 1, 2, 3, 5].map((count) => <option key={count} value={count}>{count}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title="Retries are honest">
        The interpreter is deterministic: a step that fails because a binding is missing fails the same way on every attempt. Each attempt is still recorded with its backoff so the policy is visible.
      </Notice>
      <Button variant="primary" onClick={() => { context.toast("Mapping updated", `${node.label} now maps ${node.config?.titleExpr || "no title"}. Save the graph to keep it.`); close(); }}>Done</Button>
    </Stack>
  );
}

export function PolicySimulation({ context }: { context: ScreenContext }) {
  const { record, draft } = useActionContext(context);
  if (!record || !draft) return <Empty title="Open an automation first" />;
  const node = draft.graph.nodes.find((item) => item.id === draft.selectedNodeId);
  const capability = node?.config?.capability ? capabilityById(node.config.capability) : undefined;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Step", value: node?.label ?? "none selected" },
        { label: "Action", value: ACTION_KINDS.find((kind) => kind.id === node?.config?.kind)?.label ?? "—" },
        { label: "Impact", value: node?.config?.impact ?? "low" },
        { label: "Role view", value: context.role },
        { label: "May run automations", value: context.can("run_automation") ? "yes" : "no" },
      ]} />
      {capability ? (
        <Notice tone={CAPABILITY_TONE[capability.state] === "success" ? "success" : "warning"} title={`${capability.label} — ${CAPABILITY_LABELS[capability.state]}`}>
          {capability.note} If this step runs, the interpreter records it as blocked with the reason, and {capability.localEquivalent.toLowerCase()}
        </Notice>
      ) : (
        <Notice tone="info" title="This step calls no provider">It only changes records inside this workspace.</Notice>
      )}
      {node?.config?.impact === "high" && (
        <Notice tone="warning" title="High impact steps do not run on test data">
          A dry run marks this step blocked without executing it. Only a live run with the graph saved and validation clean can execute it.
        </Notice>
      )}
      <Notice tone="info" title="Not server-side enforcement">
        These checks shape what this browser offers. A future service would enforce them on the server; this screen does not claim that it does.
      </Notice>
    </Stack>
  );
}

export function VariableSelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, draft } = useActionContext(context);
  const [target, setTarget] = useState<"titleExpr" | "summaryExpr">("titleExpr");
  if (!record || !draft) return <Empty title="Open an automation first" />;
  const node = draft.graph.nodes.find((item) => item.id === draft.selectedNodeId && item.type === "action");
  const bindings = bindingsOf(draft.graph);

  return (
    <Stack gap={4}>
      {!node && <Notice tone="warning" title="No action step selected">Choose Insert a variable on an action card to put a binding into one of its templates.</Notice>}
      {node && (
        <Field label="Insert into">
          <Select value={target} onChange={(event) => setTarget(event.target.value as typeof target)}>
            <option value="titleExpr">Title mapping</option>
            <option value="summaryExpr">Summary mapping</option>
          </Select>
        </Field>
      )}
      <Stack gap={2}>
        {bindings.map((binding) => (
          <Row key={binding.path} gap={2} className="ds-panel" style={{ padding: "var(--space-2) var(--space-3)" }}>
            <code className="ds-num">{`{${binding.path}}`}</code>
            <span className="ds-grow ds-subtle" style={{ fontSize: "var(--text-xs)" }}>{binding.note}</span>
            {node && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const current = String(node.config?.[target] ?? "");
                  setDraftGraph(record.id, {
                    ...draft.graph,
                    nodes: draft.graph.nodes.map((item) => (item.id === node.id ? { ...item, config: { ...item.config, [target]: `${current}{${binding.path}}` } } : item)),
                  }, `${binding.path} inserted into ${node.label}`);
                  context.toast("Binding inserted", `${binding.path} was added to the ${target === "titleExpr" ? "title" : "summary"} mapping.`);
                  close();
                }}
              >
                Insert
              </Button>
            )}
          </Row>
        ))}
      </Stack>
      <Notice tone="info" title="A binding that does not resolve fails the step">
        If a template names something the run has not bound, the step fails with the template quoted, rather than writing “undefined” into a record.
      </Notice>
    </Stack>
  );
}
