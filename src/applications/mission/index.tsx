import { useRef, useState } from "react";
import {
  Boxes, ClipboardCheck, FileText, GitBranch, LayoutTemplate, Play, Receipt, Rocket, Target, Wallet,
} from "lucide-react";
import {
  Avatar, BarChart, Button, Card, Checkbox, DataGrid, DrawerActions, Empty, FactGrid, Field, Grid, ModalActions, OVERLAY_WIDTH, OverlayActions, OverlayCancel, OverlaySection, OverlaySummary, KeyValueList, Meter, Notice, Pill,
  Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useOrgRecords, useRecord, useWorkspace } from "@/platform/workspace";
import { CAPABILITY_LABELS, capabilityById } from "@/platform/capability";
import { CapabilityLine, DiagramToggle } from "@/applications/t2_shared/pieces";
import { EMPTY_MISSION, useMissionWizard, usePanelFlags } from "@/applications/t2_shared/store";
import {
  BOARD_LANES, OPERATIONS, blockedReason, dependenciesOf, isRetrySafe, operationFor, readyTasks,
  runStep, wouldCycle, type StepResult,
} from "./interpreter";
import type { Rec } from "@/domain/types";
import { clockIso } from "@/platform/clock";
import { commitTogether } from "@/applications/shared/commit";

import { ExecutionStatusCard, MilestoneTimeline, MilestonesCard, MissionBriefCard, ParticipantsPanel } from "./BriefPanels";
import { TaskSchedule } from "./TaskSchedule";
/* ====================================================================== *
 * MISSION — Missions & Autonomous Execution
 *
 * Audit A19: execution was a status string. Here a mission is a plan of
 * typed steps that the local interpreter actually runs against records in
 * this browser. A step that would touch an external service stops at the
 * provider boundary, writes a receipt saying why, and is never shown as done.
 * ====================================================================== */

interface Criterion { id: string; label: string; verified: boolean; evidenceId?: string }

function criteriaOf(mission: Rec | undefined): Criterion[] {
  const body = mission?.body as { criteria?: Criterion[] } | undefined;
  return body?.criteria ?? [];
}

/** Money committed to a mission, from its commitment cost records (the same figure Overview and Budget show). */
function commitmentMinor(costs: Rec[], missionId: string): number {
  return costs
    .filter((cost) => cost.fields.missionId === missionId && cost.fields.kind === "commitment")
    .reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
}

function useMissionData() {
  return useCollections([
    "missions", "missionTasks", "missionSteps", "missionReceipts", "missionCosts",
    "agents", "members", "documents", "templates", "departments", "contacts", "companies",
    "suppliers", "policies", "decisions", "messages", "risks", "objectives", "sources",
  ]);
}

function useMission(context: ScreenContext) {
  const data = useMissionData();
  const asked = useRecord(context.params.id);
  const mission = asked?.collection === "missions" ? asked : data.missions[0];
  const tasks = data.missionTasks.filter((task) => task.parentId === mission?.id);
  const steps = data.missionSteps
    .filter((step) => step.parentId === mission?.id)
    .sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0));
  const receipts = data.missionReceipts.filter((receipt) => receipt.parentId === mission?.id);
  const costs = data.missionCosts.filter((cost) => cost.fields.missionId === mission?.id);
  const deliverables = data.documents.filter((document) => document.fields.missionId === mission?.id);
  return { data, mission, tasks, steps, receipts, costs, deliverables };
}

function missionTone(status: string): "success" | "info" | "warning" | "neutral" {
  if (status === "running") return "info";
  if (status === "completed") return "success";
  if (["waiting", "awaiting_approval", "blocked"].includes(status)) return "warning";
  return "neutral";
}

/* ---------------------------- MISSION-001 ---------------------------- */

function MissionLibrary({ context, view }: { context: ScreenContext; view: string }) {
  const data = useMissionData();
  const mode = usePanelFlags((state) => state.flags["mission.library.list"] === true);
  const map: Record<string, string[]> = {
    Proposed: ["proposed", "draft"], Running: ["running", "executing"], Waiting: ["waiting", "awaiting_approval", "blocked"],
    Completed: ["completed"], Archived: ["archived"],
  };
  const rows = view === "All"
    ? data.missions.filter((mission) => mission.status !== "archived")
    : data.missions.filter((mission) => (map[view] ?? []).includes(mission.status));

  if (rows.length === 0) {
    return (
      <Empty title={`No ${view.toLowerCase()} mission`} icon={<Rocket size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/new`)}>Create a mission</Button>}>
        A mission is a goal, a plan of typed steps, a team, a ceiling and the criteria that say it is finished.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      {view === "Archived" && (
        <Notice tone="info" title="Archived missions are auditable, not executable">
          Their plans, receipts and costs stay readable. No step can be run and no budget can be committed on them.
        </Notice>
      )}
      <Row gap={3} wrap>
        <DiagramToggle
          mode={mode ? "list" : "diagram"}
          onChange={(next) => usePanelFlags.getState().set("mission.library.list", next === "list")}
          note="Cards show progress and blockers; the list sorts and filters."
          diagramLabel="Cards"
        />
      </Row>

      {mode ? (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label={`${view} missions`}
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.navigate(`/o/${context.org.slug}/mission/missions/${id}`)}
          columns={[
            { key: "title", header: "Mission", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
            { key: "status", header: "Status", cell: (row) => <Pill tone={missionTone(row.status)} dot>{row.status}</Pill> },
            { key: "owner", header: "Owner", cell: (row) => <Row gap={2}><Avatar name={row.ownerName} size="sm" />{row.ownerName}</Row> },
            { key: "budget", header: "Ceiling", align: "end", cell: (row) => context.money(Number(row.fields.budgetMinor ?? 0)), sortValue: (row) => Number(row.fields.budgetMinor ?? 0) },
            { key: "committed", header: "Committed", align: "end", cell: (row) => context.money(commitmentMinor(data.missionCosts, row.id)) },
            { key: "due", header: "Due", align: "end", cell: (row) => context.date(row.dueAt), sortValue: (row) => row.dueAt ?? "~" },
          ]}
          bulkActions={[
            {
              label: "Tag as priority",
              onRun: (selected) => {
                void (async () => {
                  const tagged = await tagMissions(context, selected, "priority");
                  if (tagged > 0) context.toast("Tagged", `${tagged} of ${selected.length} mission${selected.length === 1 ? "" : "s"} tagged priority.`);
                })();
              },
            },
          ]}
        />
      ) : (
        <Grid>
          {rows.map((mission) => {
            const tasks = data.missionTasks.filter((task) => task.parentId === mission.id);
            const verified = tasks.filter((task) => String(task.fields.stage) === "verified").length;
            const blocked = tasks.filter((task) => String(task.fields.stage) === "blocked");
            const criteria = criteriaOf(mission);
            return (
              <Card
                key={mission.id}
                span={4}
                eyebrow="MISSION"
                prov={mission.status === "completed" ? "posted" : "human"}
                title={mission.title}
                subtitle={mission.summary}
                actions={<Pill tone={missionTone(mission.status)} dot>{mission.status}</Pill>}
                footer={<>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`)}>Open</Button>
                  <Button size="sm" variant="ghost" onClick={() => { context.select(mission.id); context.openOverlay("Mission quick view", { id: mission.id }); }}>Quick view</Button>
                  <span className="ds-grow" />
                  <span className="ds-subtle ds-num">{context.money(commitmentMinor(data.missionCosts, mission.id))} / {context.money(Number(mission.fields.budgetMinor ?? 0))}</span>
                </>}
              >
                <Stack gap={3}>
                  <div>
                    <Row gap={2}><span className="ds-grow ds-subtle">Tasks verified</span><strong className="ds-num">{verified} / {tasks.length}</strong></Row>
                    <Meter value={verified} max={tasks.length || 1} label={`${mission.title} progress`} tone={verified === tasks.length && tasks.length > 0 ? "success" : undefined} />
                  </div>
                  <Properties rows={[
                    { label: "Owner", value: mission.ownerName },
                    { label: "Criteria met", value: `${criteria.filter((criterion) => criterion.verified).length} of ${criteria.length}` },
                    { label: "Due", value: mission.dueAt ? context.date(mission.dueAt) : "No date" },
                  ]} />
                  {blocked.length > 0 && (
                    <Notice tone="warning" title={`${blocked.length} blocked task${blocked.length === 1 ? "" : "s"}`}>
                      {blocked.map((task) => task.title).join(", ")}
                    </Notice>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}

/* ---------------------------- MISSION-002 ---------------------------- */

const WIZARD_STEPS = ["Goal", "Context", "Team", "Plan", "Permissions", "Review"] as const;
type WizardStep = typeof WIZARD_STEPS[number];

function wizardProblems(draft: ReturnType<typeof useMissionWizard.getState>["draft"], step: WizardStep): string[] {
  switch (step) {
    case "Goal": {
      const problems: string[] = [];
      if (draft.goal.trim().length < 8) problems.push("Write what the mission must achieve, in a sentence.");
      if (!draft.successCriteria.trim()) problems.push("At least one success criterion is needed, or nothing can verify completion.");
      return problems;
    }
    case "Context":
      return draft.contextIds.length === 0 ? ["Attach at least one record the mission is about."] : [];
    case "Team":
      return draft.agentIds.length === 0 ? ["Assign at least one AI employee or person."] : [];
    case "Plan":
      return draft.steps.length === 0 ? ["A plan needs at least one step."] : [];
    case "Permissions": {
      const problems: string[] = [];
      if (!draft.targetId) problems.push("Choose exactly one target account. An unknown target cannot be authorised.");
      if (draft.budgetMinor <= 0) problems.push("Set a ceiling above zero. An unbounded mission cannot be authorised.");
      return problems;
    }
    case "Review":
      return [];
  }
}

function MissionCreation({ context, step }: { context: ScreenContext; step: WizardStep }) {
  const data = useMissionData();
  const draft = useMissionWizard((state) => state.draft);
  const set = useMissionWizard((state) => state.set);
  const problems = wizardProblems(draft, step);
  const all = WIZARD_STEPS.flatMap((item) => wizardProblems(draft, item).map((problem) => ({ step: item, problem })));
  const targets = [...data.contacts, ...data.companies, ...data.suppliers];

  const body = () => {
    if (step === "Goal") {
      return (
        <Stack gap={4}>
          <Field label="What must this mission achieve?" required>
            <TextArea value={draft.goal} rows={3} onChange={(event) => set({ goal: event.target.value })} required />
          </Field>
          <Field label="How will we know it is done?" required hint="One criterion per line. Each must be checkable against a record.">
            <TextArea value={draft.successCriteria} rows={4} onChange={(event) => set({ successCriteria: event.target.value })} required />
          </Field>
          <Field label="Linked objective">
            <Select value={draft.templateId ?? ""} onChange={(event) => set({ templateId: event.target.value })}>
              <option value="">No objective</option>
              {data.objectives.map((objective) => <option key={objective.id} value={objective.id}>{objective.title}</option>)}
            </Select>
          </Field>
          <Notice tone="info" title="Nothing writes this for you">
            No model is connected, so the goal and criteria are your words. The plan below is assembled from recorded operations, not generated.
          </Notice>
        </Stack>
      );
    }
    if (step === "Context") {
      const pool = [...data.documents, ...data.sources, ...data.risks, ...data.decisions].slice(0, 20);
      return (
        <Stack gap={3}>
          <Notice tone="info" title="Context is read when a step runs">
            Attached records are what the plan's read steps look at. Nothing is copied into the mission.
          </Notice>
          {pool.map((record) => (
            <Row key={record.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={`${record.title} — ${record.collection}`}
                checked={draft.contextIds.includes(record.id)}
                onChange={(event) => set({ contextIds: event.target.checked ? [...draft.contextIds, record.id] : draft.contextIds.filter((id) => id !== record.id) })}
              />
              <span className="ds-grow" />
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Source picker", { id: record.id })}>Inspect</Button>
            </Row>
          ))}
        </Stack>
      );
    }
    if (step === "Team") {
      return (
        <Stack gap={3}>
          <Field label="Department">
            <Select value={draft.departmentId} onChange={(event) => set({ departmentId: event.target.value })}>
              <option value="">No department</option>
              {data.departments.map((department) => <option key={department.id} value={department.id}>{department.title}</option>)}
            </Select>
          </Field>
          {data.agents.map((agent) => (
            <Row key={agent.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={`${agent.title} — ${String(agent.fields.role ?? "")}`}
                checked={draft.agentIds.includes(agent.id)}
                disabled={agent.status !== "active"}
                onChange={(event) => set({ agentIds: event.target.checked ? [...draft.agentIds, agent.id] : draft.agentIds.filter((id) => id !== agent.id) })}
              />
              <span className="ds-grow" />
              <Pill tone={agent.status === "active" ? "success" : "warning"}>{agent.status}</Pill>
            </Row>
          ))}
          <Button variant="secondary" onClick={() => context.openOverlay("team selector")}>Who can do what</Button>
        </Stack>
      );
    }
    if (step === "Plan") {
      return (
        <Stack gap={4}>
          <Notice tone="info" title="A step names an operation this workspace can actually run">
            Read and compute steps run locally. A provider step is recorded so the plan is honest about where it stops.
          </Notice>
          <Stack gap={2}>
            {draft.steps.map((planStep, index) => (
              <Row key={`${planStep.title}-${index}`} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <strong className="ds-num">{index + 1}</strong>
                <div className="ds-grow">
                  <strong>{planStep.title}</strong>
                  <div className="ds-subtle">{planStep.kind}{planStep.capability ? ` · ${planStep.capability}` : ""}</div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => set({ steps: draft.steps.filter((_, position) => position !== index) })}>Remove</Button>
              </Row>
            ))}
            {draft.steps.length === 0 && <span className="ds-subtle">No step yet.</span>}
          </Stack>
          <Field label="Add a step">
            <Select
              value=""
              onChange={(event) => {
                const operation = OPERATIONS.find((item) => item.id === event.target.value);
                if (!operation) return;
                set({ steps: [...draft.steps, { title: operation.label, kind: operation.kind, capability: operation.capability }] });
              }}
            >
              <option value="">Choose an operation…</option>
              {OPERATIONS.map((operation) => (
                <option key={operation.id} value={operation.id}>{operation.label} — {operation.kind}{operation.capability ? " (provider)" : ""}</option>
              ))}
            </Select>
          </Field>
        </Stack>
      );
    }
    if (step === "Permissions") {
      const matching = targets.filter((target) => draft.goal.toLowerCase().includes(target.title.toLowerCase().split(" ")[0].toLowerCase()));
      return (
        <Stack gap={4}>
          <Field
            label="Target account"
            required
            error={!draft.targetId ? "One named account is required before a mission can be proposed." : undefined}
            hint={matching.length > 1 ? `${matching.length} accounts match words in the goal: ${matching.map((item) => item.title).join(", ")}. Choose which one.` : undefined}
          >
            <Select value={draft.targetId} onChange={(event) => set({ targetId: event.target.value })} required>
              <option value="">Choose an account…</option>
              {targets.map((target) => <option key={target.id} value={target.id}>{target.title} ({target.collection})</option>)}
            </Select>
          </Field>
          <Field label={`Ceiling (${context.org.currency})`} required hint="The most this mission may commit. Nothing can be spent beyond it.">
            <TextInput
              value={(draft.budgetMinor / 100).toFixed(2)}
              align="end"
              inputMode="decimal"
              invalid={draft.budgetMinor <= 0}
              onChange={(event) => set({ budgetMinor: Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100) })}
            />
          </Field>
          <Field label="Due date"><TextInput type="date" value={draft.dueAt} onChange={(event) => set({ dueAt: event.target.value })} /></Field>
          <Stack gap={2}>
            <span className="ds-field-label">Grants</span>
            {[
              { id: "workspace.read", label: "Read records in this organisation", available: true },
              { id: "workspace.draft", label: "Create draft records", available: true },
              { id: "email.send", label: "Send email", available: false },
              { id: "payment.capture", label: "Take a payment", available: false },
            ].map((grant) => (
              <Checkbox
                key={grant.id}
                label={`${grant.label}${grant.available ? "" : " — provider not connected"}`}
                disabled={!grant.available}
                checked={draft.grants.includes(grant.id)}
                onChange={(event) => set({ grants: event.target.checked ? [...draft.grants, grant.id] : draft.grants.filter((item) => item !== grant.id) })}
              />
            ))}
          </Stack>
          <Button variant="secondary" onClick={() => context.openOverlay("risk review")}>Review the risks</Button>
        </Stack>
      );
    }
    return (
      <Stack gap={4}>
        <Card eyebrow="REVIEW" prov="human" title="What would be created" subtitle="Nothing is written until you submit">
          <Properties rows={[
            { label: "Goal", value: draft.goal || "Not set" },
            { label: "Criteria", value: String(draft.successCriteria.split("\n").filter(Boolean).length) },
            { label: "Context records", value: String(draft.contextIds.length) },
            { label: "Team", value: draft.agentIds.map((id) => data.agents.find((agent) => agent.id === id)?.title ?? id).join(", ") || "None" },
            { label: "Plan", value: `${draft.steps.length} steps (${draft.steps.filter((item) => item.kind === "provider").length} stop at a provider boundary)` },
            { label: "Target", value: targets.find((target) => target.id === draft.targetId)?.title ?? "Not chosen" },
            { label: "Ceiling", value: context.money(draft.budgetMinor) },
            { label: "Grants", value: draft.grants.join(", ") || "None" },
          ]} />
        </Card>
        {all.length > 0 ? (
          <Notice tone="danger" title={`${all.length} thing${all.length === 1 ? "" : "s"} still block submission`}>
            <ul style={{ paddingInlineStart: "1.1rem" }}>
              {all.map((item) => <li key={`${item.step}-${item.problem}`}><strong>{item.step}:</strong> {item.problem}</li>)}
            </ul>
          </Notice>
        ) : (
          <Notice tone="success" title="Ready to submit for approval">
            The mission will be created as proposed. No step runs until a person approves the plan.
          </Notice>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap={4}>
      <Grid>
        <Card span={8} title={step} subtitle={`Step ${WIZARD_STEPS.indexOf(step) + 1} of ${WIZARD_STEPS.length}`}>
          <Stack gap={4}>
            {body()}
            {problems.length > 0 && (
              <Notice tone="warning" title="This step is incomplete">
                <ul style={{ paddingInlineStart: "1.1rem" }}>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
              </Notice>
            )}
            <Row gap={2}>
              <Button variant="secondary" disabled={WIZARD_STEPS.indexOf(step) === 0} onClick={() => context.setTab(WIZARD_STEPS[Math.max(0, WIZARD_STEPS.indexOf(step) - 1)])}>Back</Button>
              <Button variant="primary" disabled={WIZARD_STEPS.indexOf(step) === WIZARD_STEPS.length - 1} onClick={() => context.setTab(WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, WIZARD_STEPS.indexOf(step) + 1)])}>Continue</Button>
              <span className="ds-grow" />
              <Button variant="ghost" onClick={() => { useMissionWizard.getState().reset(); context.toast("Draft cleared", "Nothing was written to the workspace."); }}>Clear</Button>
            </Row>
          </Stack>
        </Card>
        <Card span={4} prov="human" title="Mission so far">
          <Stack gap={3}>
          <ol className="mission-builder-steps" aria-label="Step completion">
            {WIZARD_STEPS.map((item, index) => {
              const earlier = WIZARD_STEPS.slice(0, index);
              const done = wizardProblems(draft, item).length === 0 && earlier.every((other) => wizardProblems(draft, other).length === 0);
              return (
                <li key={item} data-done={done || undefined} data-current={item === step || undefined}>
                  <button type="button" onClick={() => context.setTab(item)} aria-current={item === step ? "step" : undefined}>
                    <span aria-hidden="true">{done ? "✓" : index + 1}</span>
                    {item}<span className="ds-sr-only">{done ? ", complete" : ", incomplete"}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <Properties rows={[
            { label: "Goal", value: draft.goal ? `${draft.goal.slice(0, 48)}…` : "—" },
            { label: "Context", value: String(draft.contextIds.length) },
            { label: "Team", value: String(draft.agentIds.length) },
            { label: "Steps", value: String(draft.steps.length) },
            { label: "Ceiling", value: context.money(draft.budgetMinor) },
          ]} />
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- MISSION-003 ---------------------------- */

function MissionOverview({ context, view }: { context: ScreenContext; view: string }) {
  const { data, mission, tasks, steps, receipts, costs, deliverables } = useMission(context);
  const events = useCollection("messages");
  if (!mission) return <Empty title="No mission in this workspace" icon={<Rocket size={20} />} />;
  const criteria = criteriaOf(mission);
  const committed = costs.filter((cost) => cost.fields.kind === "commitment").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const spent = costs.filter((cost) => cost.fields.kind === "spend").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const blockedSteps = steps.filter((step) => ["blocked", "unknown_side_effect", "failed"].includes(step.status));
  const next = readyTasks(tasks)[0];

  if (view === "Plan") {
    return <PlanDependencies context={context} view="List" />;
  }
  if (view === "Team") {
    return <ParticipantsPanel context={context} mission={mission} tasks={tasks} members={data.members} agents={data.agents} />;
  }
  if (view === "Deliverables") return <Deliverables context={context} view="All" />;
  if (view === "Results") return <MissionResults context={context} view="Outcomes" />;
  if (view === "Activity") {
    const roomMessages = events.filter((message) => message.parentId === mission.id);
    const rows = [...receipts, ...roomMessages].sort((a, b) => (b.at ?? b.updatedAt).localeCompare(a.at ?? a.updatedAt));
    return rows.length === 0 ? <Empty title="No activity recorded" icon={<Receipt size={20} />} /> : (
      <Stack gap={3}>
        {rows.map((row) => (
          <Row key={row.id} gap={4} style={{ alignItems: "flex-start" }}>
            <div style={{ width: 150, flex: "none" }}>
              <strong className="ds-num">{context.date(row.at ?? row.updatedAt)}</strong>
              <div className="ds-subtle">{context.relative(row.at ?? row.updatedAt)}</div>
            </div>
            <div className="ds-panel ds-grow" style={{ padding: "var(--space-3)" }}>
              <Row gap={2}>
                <strong className="ds-grow">{row.title}</strong>
                <Pill tone={row.status === "blocked" || row.status === "failed" ? "warning" : "neutral"}>{row.collection === "missionReceipts" ? "receipt" : "message"}</Pill>
              </Row>
              <p className="ds-subtle">{row.summary}</p>
            </div>
          </Row>
        ))}
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Tasks verified" value={`${tasks.filter((task) => String(task.fields.stage) === "verified").length} / ${tasks.length}`} prov="posted" meta="Verified by a person against a criterion" />
        <Stat label="Committed" value={context.money(committed)} prov="human" meta={`of ${context.money(Number(mission.fields.budgetMinor ?? 0))} ceiling`} onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/budget`)} />
        <Stat label="Spent" value={context.money(spent)} prov="posted" meta="Money that has left the ledger" />
        <Stat label="Steps stopped" value={String(blockedSteps.length)} prov={blockedSteps.length ? "unknown" : "posted"} meta={blockedSteps.length ? "At a provider boundary" : "Nothing is stuck"} onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/execution`)} />
      </StatRow>

      <Grid>
        <MissionBriefCard context={context} mission={mission} />
        <ExecutionStatusCard context={context} mission={mission} steps={steps} tasks={tasks} />
      </Grid>

      <Grid>
        <Card span={7} prov="human" title="Completion criteria" subtitle={criteria.length === 0 ? "None recorded" : `${criteria.filter((criterion) => criterion.verified).length} of ${criteria.length} verified`}>
          <Stack gap={4}>
            <Stack gap={2}>
              {criteria.length === 0 ? <span className="ds-subtle">No criterion is recorded, so this mission cannot be completed honestly.</span> : criteria.map((criterion) => (
                <Row key={criterion.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <Pill tone={criterion.verified ? "success" : "warning"}>{criterion.verified ? "verified" : "not verified"}</Pill>
                  <span className="ds-grow">{criterion.label}</span>
                  {criterion.evidenceId && <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Status explanation", { evidenceId: criterion.evidenceId })}>Evidence</Button>}
                </Row>
              ))}
            </Stack>
            {mission.status === "completed" && criteria.some((criterion) => !criterion.verified) && (
              <Notice tone="danger" title="Marked complete with unverified criteria">
                This should not happen: completion requires every criterion to carry evidence. Reopen the mission from Results.
              </Notice>
            )}
            {mission.status !== "completed" && criteria.every((criterion) => criterion.verified) && criteria.length > 0 && (
              <Notice tone="info" title="Every criterion is verified">Closing the mission is a person's decision, recorded on the Results screen.</Notice>
            )}
          </Stack>
        </Card>

        <Card span={5} eyebrow="NEXT" prov="posted" title="Next milestone" subtitle={next ? next.title : "Nothing is ready"}>
          <Stack gap={3}>
            {next ? (
              <Properties rows={[
                { label: "Owner", value: String(next.fields.assignee ?? next.ownerName) },
                { label: "Stage", value: String(next.fields.stage ?? next.status) },
                { label: "Estimate", value: next.fields.estimateHours ? `${String(next.fields.estimateHours)} h` : "Not estimated" },
                { label: "Approval gate", value: next.fields.approvalRequired === true ? "Yes" : "No" },
              ]} />
            ) : (
              <span className="ds-subtle">Every task is waiting on a dependency, a gate or a person.</span>
            )}
            {blockedSteps.length > 0 && (
              <Notice tone="warning" title={`${blockedSteps.length} step${blockedSteps.length === 1 ? "" : "s"} stopped`}>
                {blockedSteps.map((step) => step.title).join(", ")}. Each one has a receipt saying why.
              </Notice>
            )}
            <Row gap={2} wrap>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/execution`)}>Execution console</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Status explanation")}>How is this computed?</Button>
            </Row>
          </Stack>
        </Card>

        <MilestonesCard context={context} mission={mission} tasks={tasks} />

        <Card span={12} eyebrow="DELIVERABLES" prov="agent" title="What has been produced" subtitle={`${deliverables.length} records`}>
          {deliverables.length === 0 ? <Empty title="Nothing produced yet" icon={<FileText size={20} />} /> : (
            <Row gap={2} wrap>
              {deliverables.map((deliverable) => (
                <Button key={deliverable.id} size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/deliverables`)}>
                  {deliverable.title} · {deliverable.status}
                </Button>
              ))}
            </Row>
          )}
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- MISSION-004 ---------------------------- */

function PlanDependencies({ context, view }: { context: ScreenContext; view: string }) {
  const { mission, tasks } = useMission(context);
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  if (!mission) return <Empty title="No mission" icon={<Rocket size={20} />} />;

  const ordered = [...tasks].sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0));

  if (view === "List") {
    return (
      <Stack gap={3}>
        <DataGrid
          rows={ordered}
          rowId={(row) => row.id}
          label="Plan"
          selectedId={context.selectedId}
          onSelect={(id) => context.select(id)}
          onOpen={(id) => context.openOverlay("Task inspector", { id })}
          columns={[
            { key: "order", header: "#", align: "end", cell: (row) => String(row.fields.order ?? 0), sortValue: (row) => Number(row.fields.order ?? 0) },
            { key: "title", header: "Task", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "owner", header: "Owner", cell: (row) => <Row gap={2}><Avatar name={String(row.fields.assignee ?? row.ownerName)} kind={row.fields.kind === "ai" ? "ai" : "human"} size="sm" />{String(row.fields.assignee ?? row.ownerName)}</Row> },
            { key: "stage", header: "Stage", cell: (row) => <Pill tone={String(row.fields.stage) === "verified" ? "success" : String(row.fields.stage) === "blocked" ? "warning" : "neutral"}>{String(row.fields.stage ?? row.status)}</Pill> },
            { key: "deps", header: "After", cell: (row) => dependenciesOf(row).map((id) => ordered.find((task) => task.id === id)?.title ?? id).join(", ") || "—" },
            { key: "estimate", header: "Estimate", align: "end", cell: (row) => row.fields.estimateHours ? `${String(row.fields.estimateHours)} h` : "—" },
            { key: "gate", header: "Gate", cell: (row) => row.fields.approvalRequired === true ? <Pill tone="warning">approval</Pill> : "—" },
          ]}
        />
        <Notice tone="info" title="Dependencies are editable without dragging">
          Open a task and use Add dependency. The graph and this list are the same records, so either way of working produces the same plan.
        </Notice>
      </Stack>
    );
  }

  if (view === "Timeline") {
    const withDates = ordered.filter((task) => task.dueAt || mission.dueAt);
    return (
      <Stack gap={4}>
        <MilestoneTimeline context={context} mission={mission} tasks={tasks} />
        <TaskSchedule context={context} mission={mission} tasks={ordered} />
        <Card eyebrow="TIMELINE" prov="human" title="Sequence by dependency" subtitle={`${ordered.length} tasks, ${withDates.length} with a date`}>
          <Stack gap={2}>
            {ordered.map((task, index) => {
              const depth = dependenciesOf(task).length;
              return (
                <Row key={task.id} gap={3} style={{ alignItems: "center" }}>
                  <span className="ds-num" style={{ width: 28 }}>{index + 1}</span>
                  <div className="ds-panel ds-grow" style={{ padding: "var(--space-2)", marginInlineStart: depth * 24 }}>
                    <Row gap={2}>
                      <strong className="ds-grow ds-truncate">{task.title}</strong>
                      <Pill tone={String(task.fields.stage) === "verified" ? "success" : "neutral"}>{String(task.fields.stage)}</Pill>
                      <span className="ds-subtle ds-num">{task.fields.estimateHours ? `${String(task.fields.estimateHours)} h` : "—"}</span>
                    </Row>
                    <span className="ds-subtle">{depth === 0 ? "Can start" : `After ${dependenciesOf(task).length} task${dependenciesOf(task).length === 1 ? "" : "s"}`}</span>
                  </div>
                </Row>
              );
            })}
          </Stack>
        </Card>
        <Notice tone="warning" title="No end date is predicted">
          Estimates are hours a person recorded. Nothing here turns them into a finish date: there is no velocity history in this workspace to compute one from.
        </Notice>
      </Stack>
    );
  }

  if (view === "Risks") {
    const risky = ordered.filter((task) => String(task.fields.risk ?? "").trim());
    return (
      <Stack gap={3}>
        {risky.length === 0 ? <Empty title="No risk recorded on this plan" icon={<Target size={20} />} /> : risky.map((task) => (
          <Card key={task.id} eyebrow="RISK" prov="unknown" title={task.title} subtitle={String(task.fields.assignee ?? task.ownerName)}
            footer={<Button size="sm" variant="ghost" onClick={() => { context.select(task.id); context.openOverlay("Task inspector", { id: task.id }); }}>Open the task</Button>}>
            <Notice tone="warning">{String(task.fields.risk)}</Notice>
          </Card>
        ))}
      </Stack>
    );
  }

  const nodes = ordered.map((task, index) => ({
    task,
    x: 110 + (index % 3) * 180,
    y: 70 + Math.floor(index / 3) * 120,
  }));

  return (
    <Stack gap={4}>
      <DiagramToggle mode={mode} onChange={setMode} note="The list is the accessible equivalent: the same tasks, owners, dependencies and gates." diagramLabel="Graph" />
      {mode === "list" ? <PlanDependencies context={context} view="List" /> : (
        <Card eyebrow="PLAN" prov="human" title={`${mission.title} — task graph`} subtitle={`Version ${String(mission.fields.planVersion ?? 1)} · ${ordered.length} tasks`}>
          <svg viewBox="0 0 600 420" role="img" style={{ width: "100%", height: 420 }}
            aria-label={`Task graph for ${mission.title}: ${ordered.length} tasks. Each task, its owner, its dependencies and its gate are in the list view.`}>
            {nodes.map(({ task, x, y }) => dependenciesOf(task).map((id) => {
              const from = nodes.find((node) => node.task.id === id);
              if (!from) return null;
              return <line key={`${task.id}-${id}`} x1={from.x} y1={from.y + 22} x2={x} y2={y - 22} stroke="var(--border-strong)" strokeWidth={2} markerEnd="url(#arrow)" />;
            }))}
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
              </marker>
            </defs>
            {nodes.map(({ task, x, y }) => (
              <g key={task.id} tabIndex={0} role="button" aria-label={`${task.title}, ${String(task.fields.stage)}, owner ${String(task.fields.assignee ?? task.ownerName)}`}
                onClick={() => { context.select(task.id); context.openOverlay("Task inspector", { id: task.id }); }}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); context.select(task.id); context.openOverlay("Task inspector", { id: task.id }); } }}
                style={{ cursor: "pointer" }}>
                <rect x={x - 78} y={y - 22} width={156} height={44} rx={8}
                  fill={String(task.fields.stage) === "verified" ? "var(--success-soft)" : String(task.fields.stage) === "blocked" ? "var(--warning-soft)" : "var(--bg-raised)"}
                  stroke={task.fields.approvalRequired === true ? "var(--warning)" : "var(--border-default)"} strokeWidth={2} />
                <text x={x} y={y - 2} textAnchor="middle" fontSize={11} fill="var(--fg-default)">{task.title.slice(0, 22)}</text>
                <text x={x} y={y + 13} textAnchor="middle" fontSize={9} fill="var(--fg-subtle)">{String(task.fields.stage)}{task.fields.approvalRequired === true ? " · gate" : ""}</text>
              </g>
            ))}
          </svg>
        </Card>
      )}
      <Notice tone="info" title="A published plan version is fixed">
        Version {String(mission.fields.planVersion ?? 1)} is what the execution console runs. Changing the plan records a new version rather than rewriting the one that produced the receipts.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- MISSION-005 ---------------------------- */

function TaskBoard({ context, view }: { context: ScreenContext; view: string }) {
  const { mission, tasks } = useMission(context);
  const [announcement, setAnnouncement] = useState("");
  const dragged = useRef<string | null>(null);
  if (!mission) return <Empty title="No mission" icon={<Rocket size={20} />} />;

  async function move(task: Rec, lane: string): Promise<void> {
    const gate = BOARD_LANES.find((item) => item.id === lane)?.approvalGate;
    if (gate && !context.can("approve_mission")) {
      setAnnouncement(`${task.title} was not moved to ${lane}: verifying work needs mission approval authority.`);
      context.toast("Move blocked", "Verifying is an approval. This role view cannot do it, and dragging a card does not bypass that.", "blocked");
      return;
    }
    if (gate && task.fields.approvalRequired === true && !String(task.fields.reviewedBy ?? "")) {
      setAnnouncement(`${task.title} was not moved: it has an approval gate with no recorded review.`);
      context.toast("Move blocked", "This task has an approval gate. Record a review first; a drag cannot pass it.", "blocked");
      return;
    }
    const unmet = dependenciesOf(task).filter((id) => {
      const dependency = tasks.find((item) => item.id === id);
      return dependency && !["verified", "done"].includes(String(dependency.fields.stage ?? dependency.status));
    });
    if (["running", "review", "verified"].includes(lane) && unmet.length > 0) {
      setAnnouncement(`${task.title} was not moved: ${unmet.length} dependencies are unfinished.`);
      context.toast("Move blocked", `${unmet.map((id) => tasks.find((item) => item.id === id)?.title).join(", ")} must finish first.`, "blocked");
      return;
    }
    if (!(await context.mutate.patch(task.id, {
      status: lane === "verified" ? "done" : lane,
      fields: { ...task.fields, stage: lane, movedBy: context.actor },
    }, { expectRevision: task.revision, event: `${task.title} moved to ${lane} by ${context.actor}` }))) return;
    setAnnouncement(`${task.title} moved to ${lane}.`);
    context.toast("Moved", `${task.title} is in ${lane}. The record changed; nothing executed.`);
  }

  if (view === "List") {
    return (
      <DataGrid
        rows={tasks}
        rowId={(row) => row.id}
        label="Mission tasks"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Task detail", { id })}
        columns={[
          { key: "title", header: "Task", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "stage", header: "Lane", cell: (row) => <Pill tone={String(row.fields.stage) === "verified" ? "success" : String(row.fields.stage) === "blocked" ? "warning" : "neutral"}>{String(row.fields.stage)}</Pill> },
          { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName) },
          { key: "gate", header: "Gate", cell: (row) => row.fields.approvalRequired === true ? "Approval" : "—" },
          { key: "move", header: "Move", cell: (row) => (
            <Select aria-label={`Move ${row.title}`} value={String(row.fields.stage ?? "todo")} onChange={(event) => void move(row, event.target.value)}>
              {BOARD_LANES.map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}
            </Select>
          ) },
        ]}
      />
    );
  }

  if (view === "Assignees") {
    const owners = [...new Set(tasks.map((task) => String(task.fields.assignee ?? task.ownerName)))];
    return (
      <Grid>
        {owners.map((owner) => {
          const held = tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === owner);
          const isAgent = held[0]?.fields.kind === "ai";
          return (
            <Card key={owner} span={4} eyebrow={isAgent ? "AI EMPLOYEE" : "PERSON"} prov={isAgent ? "agent" : "human"}
              title={<Row gap={2}><Avatar name={owner} kind={isAgent ? "ai" : "human"} size="sm" />{owner}</Row>}
              subtitle={`${held.length} items`}>
              <Stack gap={2}>
                {held.map((task) => (
                  <Row key={task.id} gap={2}><span className="ds-grow ds-truncate">{task.title}</span><Pill tone={String(task.fields.stage) === "verified" ? "success" : "neutral"}>{String(task.fields.stage)}</Pill></Row>
                ))}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  return (
    <Stack gap={3}>
      <Notice tone="info" title="Moving a card changes a record, nothing else">
        Drag with a mouse, or focus a card and use the left and right arrow keys to move it between lanes. Verifying needs approval authority, and a card cannot pass an approval gate or an unfinished dependency either way.
      </Notice>
      <p aria-live="polite" className="ds-subtle">{announcement}</p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${BOARD_LANES.length}, minmax(168px, 1fr))`, gap: "var(--space-2)", overflowX: "auto", paddingBlockEnd: "var(--space-2)" }}>
        {BOARD_LANES.map((lane) => {
          const laneTasks = tasks.filter((task) => String(task.fields.stage ?? task.status) === lane.id);
          return (
            <section
              key={lane.id}
              aria-label={`${lane.label}, ${laneTasks.length} tasks`}
              className="ds-panel"
              style={{ padding: "var(--space-2)", minHeight: 220 }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const task = tasks.find((item) => item.id === dragged.current);
                if (task) void move(task, lane.id);
                dragged.current = null;
              }}
            >
              <Row gap={2} style={{ marginBlockEnd: "var(--space-2)" }}>
                <strong className="ds-grow">{lane.label}</strong>
                <span className="ds-num ds-subtle">{laneTasks.length}</span>
                {lane.approvalGate && <Pill tone="warning">gate</Pill>}
              </Row>
              <Stack gap={2}>
                {laneTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    className="ds-record-card"
                    draggable
                    aria-label={`${task.title}, in ${lane.label}, owner ${String(task.fields.assignee ?? task.ownerName)}. Use the left and right arrow keys to move it.`}
                    onDragStart={() => { dragged.current = task.id; }}
                    onClick={() => { context.select(task.id); context.openOverlay("Task detail", { id: task.id }); }}
                    onKeyDown={(event) => {
                      const index = BOARD_LANES.findIndex((item) => item.id === lane.id);
                      if (event.key === "ArrowRight" && index < BOARD_LANES.length - 1) { event.preventDefault(); void move(task, BOARD_LANES[index + 1].id); }
                      if (event.key === "ArrowLeft" && index > 0) { event.preventDefault(); void move(task, BOARD_LANES[index - 1].id); }
                    }}
                  >
                    <strong style={{ textAlign: "start", display: "block" }}>{task.title}</strong>
                    <Row gap={2} style={{ marginBlockStart: 4 }}>
                      <Avatar name={String(task.fields.assignee ?? task.ownerName)} kind={task.fields.kind === "ai" ? "ai" : "human"} size="sm" />
                      <span className="ds-subtle ds-truncate">{String(task.fields.assignee ?? task.ownerName)}</span>
                    </Row>
                    <span className="ds-subtle" style={{ display: "block", marginBlockStart: 4 }}>{task.summary}</span>
                    <Row gap={1} wrap style={{ marginBlockStart: 4 }}>
                      {task.fields.approvalRequired === true && <Pill tone="warning">approval gate</Pill>}
                      {dependenciesOf(task).length > 0 && <Pill tone="neutral">after {dependenciesOf(task).length}</Pill>}
                      {task.fields.reauthorisationRequired === true && <Pill tone="danger">re-authorise</Pill>}
                    </Row>
                  </button>
                ))}
                {laneTasks.length === 0 && <span className="ds-subtle">Empty</span>}
              </Stack>
            </section>
          );
        })}
      </div>
    </Stack>
  );
}

/* ---------------------------- MISSION-006 ---------------------------- */

async function executeStep(context: ScreenContext, step: Rec, mission: Rec, pool: Rec[], money: (minor: number | undefined) => string, date: (value: string | Date | undefined) => string, now: Date): Promise<StepResult> {
  // Every entry point runs through here, so the stop control is enforced once,
  // against the stored mission rather than whatever copy the caller holds.
  const { getRecord } = await import("@/platform/repo");
  const current = (await getRecord(mission.id)) ?? mission;
  const organisation = await getRecord(context.org.id);
  if (organisation?.fields.executionPaused === true) {
    context.toast("Dispatch is paused", `Automation is paused for ${context.org.shortName}. No step runs until an owner resumes it.`, "blocked");
    return { state: step.status as StepResult["state"], output: "", reason: "Organisation paused", read: [] };
  }
  if (current.status === "paused" || current.fields.executionPaused === true || ["cancelled", "completed"].includes(current.status)) {
    const reason = current.status === "paused" || current.fields.executionPaused === true ? "stopped" : current.status;
    context.toast("Step not started", `${current.title} is ${reason}. No step runs until it is resumed.`, "blocked");
    return { state: step.status as StepResult["state"], output: "", reason: `Mission ${reason}`, read: [] };
  }
  const result = runStep(step, { records: pool, mission, money, date, now });
  const attempts = Number(step.fields.attempts ?? 0) + 1;
  /* The step's new state, its receipt and any draft it produced are one change: a stale step revision rolls all of it back. */
  const recorded = await commitTogether(context, [
    {
      record: step,
      patch: {
        status: result.state,
        fields: { ...step.fields, attempts, lastRunBy: context.actor, lastRunAt: now.toISOString() },
        body: { ...(step.body as object), output: result.output, reason: result.reason ?? "", inputs: result.read },
      },
      event: `${step.title} run locally: ${result.state}`,
    },
    {
      create: {
        collection: "missionReceipts",
        title: `Receipt · ${String(step.fields.operation ?? step.title)}`,
        status: result.state === "done" ? "recorded" : result.state,
        parentId: mission.id,
        at: now.toISOString(),
        summary: result.state === "done"
          ? `Ran in this browser. ${result.read.length} records read.`
          : result.reason ?? "The step did not complete.",
        fields: {
          stepId: step.id,
          state: result.state === "done" ? "ready_local" : result.state === "blocked" ? "not_connected" : result.state,
          attempt: attempts,
          actor: context.actor,
          capability: result.capability ?? "",
        },
        body: { request: String(step.fields.operation ?? ""), response: result.output, reason: result.reason ?? "", read: result.read },
      },
      event: `Receipt written for ${step.title}`,
    },
    ...(result.create ? [{
      create: {
        collection: result.create.collection,
        title: result.create.title,
        status: "draft",
        parentId: mission.id,
        summary: result.create.summary,
        at: now.toISOString(),
        fields: { missionId: mission.id, deliverable: true, version: 1, approval: "draft", producedBy: "local interpreter" },
        body: { text: result.create.text, versions: [{ version: 1, at: now.toISOString(), author: "Local interpreter", summary: "Composed from workspace records." }] },
      },
      event: `Draft produced by ${step.title}`,
    }] : []),
  ]);
  if (!recorded) return { state: step.status as StepResult["state"], output: "", reason: "The step changed elsewhere", read: [] };

  if (result.state === "done") {
    context.toast("Step ran", `${step.title} read ${result.read.length} records. The output and a receipt are on the record.`);
  } else if (result.state === "blocked") {
    context.toast("Stopped at the provider boundary", result.reason ?? "The provider is not connected.", "blocked");
  } else if (result.state === "awaiting_approval") {
    context.toast("Held at the gate", "A person with approval authority has to decide before the mission continues.", "info");
  } else {
    context.toast("Step failed", result.reason ?? "The step did not complete.", "failed");
  }
  return result;
}

function ExecutionConsole({ context, view }: { context: ScreenContext; view: string }) {
  const { mission, steps, receipts } = useMission(context);
  const { now, money, date } = useWorkspace();
  const [busy, setBusy] = useState<string | null>(null);
  /* The interpreter reads across the workspace, so the pool is the whole
     organisation rather than the mission's own collections. */
  const pool = useOrgRecords();
  const organisation = useRecord(context.org.id);
  if (!mission) return <Empty title="No mission" icon={<Rocket size={20} />} />;

  /* HANDOFF rule 8: no step runs while the organisation or this mission is paused. */
  const orgPaused = organisation?.fields.executionPaused === true;
  const missionPaused = mission.status === "paused" || mission.fields.executionPaused === true;
  const held = orgPaused || missionPaused;
  const heldReason = orgPaused ? "Automation is paused for the organisation" : "This mission is paused";
  const nextRunnable = steps.find((step) => ["ready", "todo"].includes(step.status));
  const exceptions = steps.filter((step) => ["blocked", "failed", "unknown_side_effect"].includes(step.status));
  const gates = steps.filter((step) => String(step.fields.kind) === "approval");

  if (view === "Actions") {
    return (
      <Stack gap={3}>
        <DataGrid
          rows={steps}
          rowId={(row) => row.id}
          label="Step actions"
          columns={[
            { key: "order", header: "#", align: "end", cell: (row) => String(row.fields.order ?? 0), sortValue: (row) => Number(row.fields.order ?? 0) },
            { key: "title", header: "Step", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "operation", header: "Operation", cell: (row) => <code className="ds-num">{String(row.fields.operation ?? "—")}</code> },
            { key: "kind", header: "Kind", cell: (row) => <Pill tone={String(row.fields.kind) === "provider" ? "warning" : "neutral"}>{String(row.fields.kind)}</Pill> },
            { key: "runs", header: "Attempts", align: "end", cell: (row) => String(row.fields.attempts ?? 0) },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.status === "done" ? "success" : ["blocked", "unknown_side_effect", "failed"].includes(row.status) ? "warning" : "neutral"}>{row.status.replace(/_/g, " ")}</Pill> },
            { key: "safe", header: "Retry safe", cell: (row) => isRetrySafe(row) ? "Yes" : <Pill tone="warning">No</Pill> },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("execution trace", { id }); }}
        />
        <Notice tone="info" title="What each kind can do here">
          Read and compute steps run against records in this browser. A draft step writes a record. An approval step waits for a person. A provider step stops, writes a receipt and never claims success.
        </Notice>
      </Stack>
    );
  }

  if (view === "Checkpoints") {
    return (
      <Stack gap={4}>
        {gates.length === 0 ? <Empty title="This plan has no approval gate" icon={<ClipboardCheck size={20} />} /> : gates.map((gate) => (
          <Card key={gate.id} eyebrow="APPROVAL GATE" prov="human" title={gate.title} subtitle={gate.summary}
            actions={<Pill tone={gate.status === "done" ? "success" : "warning"}>{gate.status.replace(/_/g, " ")}</Pill>}
            footer={<>
              <Button
                size="sm"
                variant="primary"
                disabled={gate.status === "done" || !context.can("approve_mission")}
                title={context.can("approve_mission") ? undefined : "This role view does not approve missions"}
                onClick={async () => {
                  if (!(await context.mutate.patch(gate.id, { status: "done", fields: { ...gate.fields, approvedBy: context.actor, approvedAt: now.toISOString() } }, { expectRevision: gate.revision, event: `${gate.title} approved by ${context.actor}` }))) return;
                  context.toast("Gate passed", `${context.actor} approved it. The next step can be run.`);
                }}
              >
                Approve
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(gate.id); context.openOverlay("Action receipt", { id: gate.id }); }}>Receipt</Button>
            </>}>
            <Properties rows={[
              { label: "Approved by", value: String(gate.fields.approvedBy || "Nobody yet") },
              { label: "When", value: gate.fields.approvedAt ? context.dateTime(String(gate.fields.approvedAt)) : "—" },
              { label: "Your role view", value: context.can("approve_mission") ? "Can approve" : "Cannot approve" },
            ]} />
          </Card>
        ))}
        <Notice tone="warning" title="A gate is not a formality">
          Nothing past a gate runs until a person decides. Role views shape who is offered the button here; they are not an account security boundary.
        </Notice>
      </Stack>
    );
  }

  if (view === "Exceptions") {
    return (
      <Stack gap={4}>
        {exceptions.length === 0 ? <Empty title="No exception" icon={<Receipt size={20} />}>Every step either ran or is waiting its turn.</Empty> : exceptions.map((step) => {
          const body = step.body as { reason?: string } | undefined;
          const capability = capabilityById(String(step.fields.capability ?? ""));
          return (
            <Card key={step.id} eyebrow="EXCEPTION" prov="unknown" title={step.title}
              subtitle={`${step.status.replace(/_/g, " ")} · ${String(step.fields.attempts ?? 0)} attempts`}
              actions={capability ? <Pill tone="warning">{capability.label}: {CAPABILITY_LABELS[capability.state]}</Pill> : undefined}
              footer={<>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!isRetrySafe(step)}
                  title={blockedReason(step)}
                  onClick={() => { context.select(step.id); context.openOverlay("retry confirmation", { id: step.id }); }}
                >
                  Retry
                </Button>
                {step.status === "unknown_side_effect" && (
                  <Button size="sm" variant="outline-danger" onClick={async () => {
                    if (!(await context.mutate.patch(step.id, { status: "failed", fields: { ...step.fields, reconciledBy: context.actor } }, { expectRevision: step.revision, event: `${step.title} reconciled by ${context.actor}: no effect found` }))) return;
                    context.toast("Reconciled", "You recorded that no external effect happened. The step can now be retried.");
                  }}>Reconcile</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => { context.select(step.id); context.openOverlay("execution trace", { id: step.id }); }}>Trace</Button>
              </>}>
              <Stack gap={2}>
                <Notice tone={step.status === "unknown_side_effect" ? "danger" : "warning"}>{body?.reason || step.summary}</Notice>
                {step.status === "unknown_side_effect" && (
                  <p className="ds-prose">
                    Retrying is disabled until someone records what happened. An attempt with no recorded response may already have had an effect, and repeating it could double it.
                  </p>
                )}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      {held && (
        <Notice tone="warning" title={orgPaused ? "Dispatch is held for the whole organisation" : "This mission is paused"}>
          {orgPaused ? "An owner resumes it from the Autonomy Centre." : "Resume it from the mission overview."} No step starts while it is held. Actions already accepted elsewhere cannot be confirmed from here.
        </Notice>
      )}
      <Row gap={2} wrap>
        <span className="ds-subtle">
          {nextRunnable ? `Next: ${nextRunnable.title} (${String(nextRunnable.fields.kind)})` : "Nothing is ready. Steps wait on gates, exceptions or their order."}
        </span>
      </Row>

      <ol className="ds-stack ds-gap-3" style={{ listStyle: "none", padding: 0 }}>
        {steps.map((step) => {
          const body = step.body as { output?: string; reason?: string; inputs?: string[] } | undefined;
          const stepReceipts = receipts.filter((receipt) => receipt.fields.stepId === step.id);
          const operation = operationFor(String(step.fields.operation ?? ""));
          const tone = step.status === "done" ? "var(--success)" : ["blocked", "failed", "unknown_side_effect"].includes(step.status) ? "var(--warning)" : step.status === "awaiting_approval" ? "var(--info)" : "var(--border-default)";
          return (
            <li key={step.id}>
              <div className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${tone}` }}>
                <Row gap={2} wrap>
                  <span className="ds-num ds-subtle">{String(step.fields.order ?? 0)}</span>
                  <strong className="ds-grow">{step.title}</strong>
                  <code className="ds-num ds-subtle">{String(step.fields.operation ?? step.fields.kind ?? "")}</code>
                  <Pill tone={step.status === "done" ? "success" : ["blocked", "failed", "unknown_side_effect"].includes(step.status) ? "warning" : step.status === "awaiting_approval" ? "info" : "neutral"} dot>
                    {step.status.replace(/_/g, " ")}
                  </Pill>
                </Row>
                <KeyValueList columns={2} items={[
                  { label: "Inputs", value: (body?.inputs ?? []).length ? `${(body?.inputs ?? []).length} record${(body?.inputs ?? []).length === 1 ? "" : "s"} read` : operation?.note ?? "Nothing read yet" },
                  { label: "Last run", value: step.fields.lastRunAt ? `${context.dateTime(String(step.fields.lastRunAt))} · ${String(step.fields.attempts ?? 0)} attempt${Number(step.fields.attempts ?? 0) === 1 ? "" : "s"}` : Number(step.fields.attempts ?? 0) > 0 ? `${String(step.fields.attempts)} attempt${Number(step.fields.attempts) === 1 ? "" : "s"}, time not recorded` : "Not run", mono: Boolean(step.fields.lastRunAt) },
                  { label: "Output", value: body?.output || "—" },
                  ...(body?.reason ? [{ label: "Why it stopped", value: body.reason }] : []),
                ]} />
                <Row gap={2} wrap style={{ marginBlockStart: "var(--space-2)" }}>
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={busy === step.id}
                    disabled={step.status === "done" || step.status === "unknown_side_effect" || held}
                    title={held ? heldReason : blockedReason(step)}
                    onClick={async () => {
                      setBusy(step.id);
                      try { await executeStep(context, step, mission, pool, money, date, now); } finally { setBusy(null); }
                    }}
                  >
                    {Number(step.fields.attempts ?? 0) > 0 ? "Run again" : "Run this step"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={stepReceipts.length === 0} onClick={() => { context.select(step.id); context.openOverlay("Action receipt", { id: step.id }); }}>
                    {stepReceipts.length} receipt{stepReceipts.length === 1 ? "" : "s"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { context.select(step.id); context.openOverlay("execution trace", { id: step.id }); }}>Trace</Button>
                </Row>
              </div>
            </li>
          );
        })}
        {steps.length === 0 && <Empty title="This mission has no steps" icon={<Play size={20} />}>Add steps on the plan before running anything.</Empty>}
      </ol>

      <CapabilityLine id="model.inference" title="What runs here" >
        Steps are executed by a local interpreter over records in this browser.
      </CapabilityLine>
    </Stack>
  );
}

/* ---------------------------- MISSION-007 ---------------------------- */

function MissionTeamRoom({ context, view }: { context: ScreenContext; view: string }) {
  const { data, mission, tasks } = useMission(context);
  const messages = useCollection("messages").filter((message) => message.parentId === mission?.id);
  const [draft, setDraft] = useState("");
  if (!mission) return <Empty title="No mission" icon={<Rocket size={20} />} />;
  const owners = [...new Set(tasks.map((task) => String(task.fields.assignee ?? task.ownerName)))];

  if (view === "Owners") {
    return (
      <Grid>
        {owners.map((owner) => {
          const held = tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === owner);
          const agent = data.agents.find((item) => item.title === owner);
          return (
            <Card key={owner} span={4} eyebrow={agent ? "AI EMPLOYEE" : "PERSON"} prov={agent ? "agent" : "human"}
              title={<Row gap={2}><Avatar name={owner} kind={agent ? "ai" : "human"} size="sm" />{owner}</Row>}
              subtitle={`${held.length} items on this mission`}
              footer={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("Agent selector", { owner })}>Hand work over</Button>}>
              <Stack gap={2}>
                {held.map((task) => <Row key={task.id} gap={2}><span className="ds-grow ds-truncate">{task.title}</span><Pill tone={String(task.fields.stage) === "verified" ? "success" : "neutral"}>{String(task.fields.stage)}</Pill></Row>)}
              </Stack>
            </Card>
          );
        })}
        {owners.length === 0 && <Empty title="Nobody holds work on this mission" icon={<Rocket size={20} />} />}
      </Grid>
    );
  }

  if (view === "Decisions") {
    const decisions = data.decisions.filter((decision) => decision.fields.missionId === mission.id);
    return (
      <Stack gap={3}>
        {decisions.length === 0 ? <Empty title="No decision is recorded against this mission" icon={<ClipboardCheck size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("decision record")}>Record one</Button>} /> : decisions.map((decision) => (
          <Card key={decision.id} eyebrow="DECISION" prov="human" title={decision.title} subtitle={`${decision.status} · ${String(decision.fields.approvers || "no approver recorded")}`}
            footer={<Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/brain/decisions`)}>Open the register</Button>}>
            <p className="ds-prose">{decision.summary}</p>
          </Card>
        ))}
      </Stack>
    );
  }

  if (view === "Reviews") {
    const gated = tasks.filter((task) => task.fields.approvalRequired === true);
    return (
      <Stack gap={3}>
        <Notice tone="info" title="A review is recorded against the task">
          The reviewer, the verdict and what was checked are kept on the record, so a later reader can see why work passed.
        </Notice>
        {gated.length === 0 ? <Empty title="No review gate on this mission" /> : gated.map((task) => (
          <Card key={task.id} eyebrow="REVIEW" prov={task.fields.kind === "ai" ? "agent" : "human"} title={task.title}
            subtitle={`Owner ${String(task.fields.assignee ?? task.ownerName)}`}
            actions={<Pill tone={String(task.fields.stage) === "verified" ? "success" : "warning"}>{String(task.fields.stage)}</Pill>}
            footer={<Button size="sm" variant="secondary" onClick={() => { context.select(task.id); context.openOverlay("handoff view", { id: task.id }); }}>Request a review</Button>}>
            <Properties rows={[
              { label: "Reviewed by", value: String(task.fields.reviewedBy || "Nobody yet") },
              { label: "Note", value: String(task.fields.reviewNote || "—") },
            ]} />
          </Card>
        ))}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={8} eyebrow="MISSION ROOM" title={`${mission.title} room`} subtitle="Requests between people and AI employees, with their evidence">
        <Stack gap={4}>
          <div role="log" aria-live="polite" aria-label="Mission room" className="ds-stack ds-gap-3" style={{ maxHeight: "46vh", overflowY: "auto" }}>
            {messages.map((message) => (
              <div key={message.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${message.fields.loop === true ? "var(--danger)" : message.fields.kind === "ai" ? "var(--accent)" : "var(--border-strong)"}` }}>
                <Row gap={2} wrap>
                  <Avatar name={String(message.fields.author)} kind={message.fields.kind === "human" ? "human" : "ai"} size="sm" />
                  <strong>{String(message.fields.author)}</strong>
                  {message.fields.requestTo ? <Pill tone="info">to {String(message.fields.requestTo)}</Pill> : null}
                  <span className="ds-subtle ds-num">{context.dateTime(message.at ?? message.createdAt)}</span>
                </Row>
                <p className="ds-prose" style={{ marginBlockStart: "var(--space-2)" }}>{message.title} — {message.summary}</p>
              </div>
            ))}
            {messages.length === 0 && <Empty title="No message in this room" icon={<Rocket size={20} />} />}
          </div>
          <form
            className="ds-stack ds-gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!draft.trim()) return;
              await context.mutate.create({
                collection: "messages",
                title: draft.slice(0, 60),
                status: "posted",
                summary: draft,
                parentId: mission.id,
                at: context.now.toISOString(),
                fields: { author: context.actor, kind: "human", room: "mission" },
              }, `Message posted in the ${mission.title} room`);
              setDraft("");
              context.toast("Posted", "The message is a record on this mission.");
            }}
          >
            <Field label="Message the room"><TextArea value={draft} rows={2} onChange={(event) => setDraft(event.target.value)} /></Field>
            <Row gap={2}>
              <Button type="submit" variant="primary" disabled={!draft.trim()}>Post</Button>
              <Button variant="secondary" onClick={() => context.openOverlay("Agent selector")}>Mention an AI employee</Button>
            </Row>
          </form>
        </Stack>
      </Card>
      <Card span={4} eyebrow="HANDOFFS" prov="agent" title="Who owns what" subtitle={`${owners.length} owners`}>
        <Stack gap={2}>
          {owners.map((owner) => (
            <Row key={owner} gap={2}>
              <Avatar name={owner} kind={data.agents.some((agent) => agent.title === owner) ? "ai" : "human"} size="sm" />
              <span className="ds-grow ds-truncate">{owner}</span>
              <span className="ds-num ds-subtle">{tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === owner).length}</span>
            </Row>
          ))}
        </Stack>
      </Card>
    </Grid>
  );
}

/* ---------------------------- MISSION-008 ---------------------------- */

function Deliverables({ context, view }: { context: ScreenContext; view: string }) {
  const { mission, deliverables } = useMission(context);
  if (!mission) return <Empty title="No mission" icon={<Rocket size={20} />} />;
  const map: Record<string, string[]> = { Draft: ["draft"], Review: ["review", "in_review"], Approved: ["approved"], Published: ["published"] };
  const rows = view === "All" ? deliverables : deliverables.filter((item) => (map[view] ?? []).includes(item.status));

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} deliverable`} icon={<FileText size={20} />}>A deliverable is produced by a draft step or written by a person. Running the plan's draft steps creates one.</Empty>;
  }

  const approvalLabel = (item: Rec) => { const label = String(item.fields.approval ?? item.status).replace(/_/g, " "); return label === "review" ? "in review" : label; };
  const versionsOf = (item: Rec) => ((item.body as { versions?: unknown[] } | undefined)?.versions ?? []).length || 1;
  return (
    <Stack gap={3}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Deliverables"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => { context.select(id); context.openOverlay("Artifact preview", { id }); }}
        card={(row) => (
          <Stack gap={2}>
            <Row gap={2}>
              <strong className="ds-grow">{row.title}</strong>
              <Pill tone={row.status === "approved" ? "success" : row.status === "published" ? "info" : row.status === "draft" ? "neutral" : "warning"} dot>{approvalLabel(row)}</Pill>
            </Row>
            <span className="ds-subtle ds-num">v{String(row.fields.version ?? 1)} · {versionsOf(row)} saved · {row.ownerName}</span>
            <Row gap={1} wrap>
              <Button size="sm" variant="secondary" disabled={row.status === "approved" || row.status === "published"} onClick={(event) => { event.stopPropagation(); context.select(row.id); context.openOverlay("approval", { id: row.id }); }}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); context.select(row.id); context.openOverlay("version diff", { id: row.id }); }}>Versions</Button>
              <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); context.select(row.id); context.openOverlay("publish verification", { id: row.id }); }}>Publish</Button>
            </Row>
          </Stack>
        )}
        columns={[
          { key: "title", header: "Deliverable", primary: true, cell: (row) => row.title, filterValue: (row) => row.title, sortValue: (row) => row.title },
          { key: "version", header: "Version", align: "end", cell: (row) => <span className="ds-num">v{String(row.fields.version ?? 1)} · {versionsOf(row)} saved</span>, sortValue: (row) => Number(row.fields.version ?? 1) },
          { key: "owner", header: "Written by", cell: (row) => <Row gap={2}><Avatar name={row.ownerName} size="sm" />{row.ownerName}</Row>, filterValue: (row) => row.ownerName },
          { key: "approval", header: "Approval", cell: (row) => <Pill tone={row.status === "approved" ? "success" : row.status === "published" ? "info" : row.status === "draft" ? "neutral" : "warning"} dot>{approvalLabel(row)}</Pill>, sortValue: (row) => row.status },
          { key: "act", header: "", align: "end", cell: (row) => (
            <Row gap={1}>
              <Button size="sm" variant="ghost" disabled={row.status === "approved" || row.status === "published"} onClick={(event) => { event.stopPropagation(); context.select(row.id); context.openOverlay("approval", { id: row.id }); }}>Approve</Button>
              <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); context.select(row.id); context.openOverlay("version diff", { id: row.id }); }}>Versions</Button>
              <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); context.select(row.id); context.openOverlay("publish verification", { id: row.id }); }}>Publish</Button>
            </Row>
          ) },
        ]}
      />
      <Notice tone="info" title="Nothing is published outside this workspace">
        No hosting is connected, so every deliverable stays here. Publish explains what a verified release would need and changes nothing.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- MISSION-009 ---------------------------- */

function MissionBudget({ context, view }: { context: ScreenContext; view: string }) {
  const { mission, costs, steps } = useMission(context);
  const policies = useCollection("policies");
  if (!mission) return <Empty title="No mission" icon={<Wallet size={20} />} />;
  const ceiling = Number(mission.fields.budgetMinor ?? 0);
  const committed = costs.filter((cost) => cost.fields.kind === "commitment").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const spent = costs.filter((cost) => cost.fields.kind === "spend").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const headroom = ceiling - committed - spent;
  const providerCosts = costs.filter((cost) => cost.fields.kind === "provider");

  if (view === "Ledger") {
    return (
      <Stack gap={3}>
        <DataGrid
          rows={costs}
          rowId={(row) => row.id}
          label="Budget ledger"
          columns={[
            { key: "title", header: "Entry", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.fields.kind === "spend" ? "success" : row.fields.kind === "provider" ? "warning" : "info"}>{String(row.fields.kind)}</Pill> },
            { key: "amount", header: "Amount", align: "end", cell: (row) => context.money(row.amountMinor), sortValue: (row) => row.amountMinor ?? 0 },
            { key: "by", header: "Approved by", cell: (row) => String(row.fields.approvedBy || "—") },
            { key: "when", header: "When", align: "end", cell: (row) => context.date(row.at ?? row.updatedAt), sortValue: (row) => row.at ?? row.updatedAt },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("cost source", { id }); }}
          summary={<span className="ds-num">Committed {context.money(committed)} · Spent {context.money(spent)}</span>}
        />
        <Notice tone="info" title="Committed is not spent">
          A commitment reserves headroom so two missions cannot promise the same money. Spent means money that has left the ledger, which in this workspace means a posted journal.
        </Notice>
      </Stack>
    );
  }

  if (view === "Policies") {
    const policy = policies.find((item) => item.fields.missionSpendCapMinor !== undefined);
    return (
      <Stack gap={4}>
        <Properties rows={[
          { label: "Workspace mission cap", value: policy ? context.money(Number(policy.fields.missionSpendCapMinor)) : "Not recorded" },
          { label: "This mission's ceiling", value: context.money(ceiling) },
          { label: "Approval needed above", value: context.money(Number(policy?.fields.missionSpendCapMinor ?? ceiling)) },
          { label: "Who may approve", value: "Owner and Finance role views" },
        ]} />
        <Notice tone="warning" title="A ceiling is not a hard cap on a provider">
          Nothing here can stop an external service charging asynchronously, because nothing external is connected. The ceiling governs what this workspace will commit and record.
        </Notice>
      </Stack>
    );
  }

  if (view === "History") {
    return (
      <Stack gap={3}>
        {costs.length === 0 ? <Empty title="No budget history" icon={<Wallet size={20} />} /> : (
          <Stack gap={2}>
            {[...costs].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).map((cost) => (
              <Row key={cost.id} gap={3} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow"><strong>{cost.title}</strong><div className="ds-subtle">{cost.summary}</div></div>
                <strong className="ds-num">{context.money(cost.amountMinor)}</strong>
                <span className="ds-subtle ds-num">{context.date(cost.at ?? cost.updatedAt)}</span>
              </Row>
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Ceiling" value={context.money(ceiling)} prov="human" meta="Authorised when the mission was proposed" />
        <Stat label="Committed" value={context.money(committed)} prov="human" meta={`${costs.filter((cost) => cost.fields.kind === "commitment").length} reservations`} />
        <Stat label="Spent" value={context.money(spent)} prov="posted" meta="Posted to the ledger" />
        <Stat label="Headroom" value={context.money(headroom)} prov={headroom < 0 ? "unknown" : "posted"} meta={headroom < 0 ? "Over the ceiling" : "Available to reserve"} />
      </StatRow>

      <Grid>
        <Card span={7} eyebrow="BUDGET" prov="human" title="Where the ceiling has gone" subtitle={`${costs.length} entries`}>
          <Stack gap={4}>
            <Meter value={committed + spent} max={ceiling || 1} label="Budget used" tone={committed + spent > ceiling * 0.9 ? "warning" : undefined} />
            <BarChart
              title="Budget by kind"
              height={180}
              format={(value) => context.money(value)}
              series={[{
                name: "Amount",
                points: [
                  { label: "Committed", value: committed },
                  { label: "Spent", value: spent },
                  { label: "Headroom", value: Math.max(0, headroom) },
                ],
              }]}
              footer="Computed from the mission's cost records. Nothing is forecast."
            />
          </Stack>
        </Card>
        <Card span={5} eyebrow="PROVIDER" prov="unknown" title="Pending provider charges" subtitle={`${providerCosts.length} recorded`}>
          <Stack gap={3}>
            {providerCosts.length === 0 ? (
              <span className="ds-subtle">No provider charge is recorded.</span>
            ) : providerCosts.map((cost) => (
              <Row key={cost.id} gap={2}><span className="ds-grow">{cost.title}</span><strong className="ds-num">{context.money(cost.amountMinor)}</strong></Row>
            ))}
            <CapabilityLine id="model.inference" title="No provider has charged anything" />
            <Notice tone="warning" title="Reservations are atomic">
              A reservation checks headroom before it is written and uses the record's revision, so two people reserving at once cannot spend the same headroom twice: the second save is rejected and has to be retried.
            </Notice>
            <Button variant="secondary" onClick={() => context.openOverlay("limit increase approval")} disabled={steps.length === 0 && costs.length === 0}>Request more headroom</Button>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- MISSION-010 ---------------------------- */

function MissionResults({ context, view }: { context: ScreenContext; view: string }) {
  const { mission, tasks, receipts, costs, deliverables } = useMission(context);
  if (!mission) return <Empty title="No mission" icon={<Target size={20} />} />;
  const criteria = criteriaOf(mission);
  const verified = criteria.filter((criterion) => criterion.verified);
  const committed = costs.filter((cost) => cost.fields.kind === "commitment").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);

  if (view === "Evidence") {
    return (
      <Stack gap={3}>
        <Notice tone="info" title="Evidence is a record, not a claim">
          Each line below points at something in this workspace. A criterion with no evidence cannot be counted as met.
        </Notice>
        <DataGrid
          rows={criteria}
          rowId={(row) => row.id}
          label="Criteria and evidence"
          filterable={false}
          columns={[
            { key: "label", header: "Criterion", primary: true, cell: (row) => row.label },
            { key: "state", header: "State", cell: (row) => <Pill tone={row.verified ? "success" : "warning"}>{row.verified ? "verified" : "not verified"}</Pill> },
            { key: "evidence", header: "Evidence", cell: (row) => row.evidenceId ?? "None attached" },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("Source inspector", { id }); }}
        />
        <Card eyebrow="RECEIPTS" prov="posted" title="What execution recorded" subtitle={`${receipts.length} receipts`}>
          <Stack gap={2}>
            {receipts.slice(0, 6).map((receipt) => (
              <Row key={receipt.id} gap={2}>
                <span className="ds-grow ds-truncate">{receipt.title}</span>
                <Pill tone={receipt.status === "recorded" ? "success" : "warning"}>{String(receipt.fields.state).replace(/_/g, " ")}</Pill>
              </Row>
            ))}
            {receipts.length === 0 && <span className="ds-subtle">Nothing has been run.</span>}
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (view === "ROI") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Committed" value={context.money(committed)} prov="human" meta="Reserved against the ceiling" />
          <Stat label="Provider cost" value={context.money(0)} prov="posted" meta="No provider is connected" />
          <Stat label="Value delivered" value="Unavailable" unavailable meta="No measured outcome exists to value" />
          <Stat label="Return" value="Unavailable" unavailable meta="Both sides of the ratio are missing" />
        </StatRow>
        <Notice tone="warning" title="No return figure is produced">
          A return would need a cost and a measured saving or gain. This workspace has neither: nothing was charged, and no outcome has been measured in money. A number here would be invented, so none is shown.
        </Notice>
        <Card eyebrow="WHAT CAN BE SAID" prov="posted" title="Counted, not claimed">
          <Properties rows={[
            { label: "Tasks verified", value: `${tasks.filter((task) => String(task.fields.stage) === "verified").length} of ${tasks.length}` },
            { label: "Criteria met", value: `${verified.length} of ${criteria.length}` },
            { label: "Deliverables produced", value: String(deliverables.length) },
            { label: "Steps stopped at a boundary", value: String(receipts.filter((receipt) => String(receipt.fields.state) === "not_connected").length) },
          ]} />
        </Card>
      </Stack>
    );
  }

  if (view === "Follow-up") {
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Unresolved work is named, not hidden">
          Anything the mission could not finish becomes a follow-up with an owner, rather than being folded into a completion claim.
        </Notice>
        <Stack gap={2}>
          {tasks.filter((task) => !["verified", "done"].includes(String(task.fields.stage ?? task.status))).map((task) => (
            <Row key={task.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <div className="ds-grow"><strong>{task.title}</strong><div className="ds-subtle">{task.summary}</div></div>
              <Pill tone="warning">{String(task.fields.stage)}</Pill>
              <Button size="sm" variant="secondary" onClick={() => { context.select(task.id); context.openOverlay("reopen", { id: task.id }); }}>Create a follow-up</Button>
            </Row>
          ))}
          {tasks.every((task) => ["verified", "done"].includes(String(task.fields.stage ?? task.status))) && <Notice tone="success">Every task is verified.</Notice>}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Criteria met" value={`${verified.length} / ${criteria.length}`} prov="posted" meta="Each needs evidence" />
        <Stat label="Tasks verified" value={`${tasks.filter((task) => String(task.fields.stage) === "verified").length} / ${tasks.length}`} prov="posted" meta="Moved by a person" />
        <Stat label="Deliverables" value={String(deliverables.length)} prov="agent" meta={`${deliverables.filter((item) => item.status === "approved").length} approved`} />
        <Stat label="Status" value={mission.status} prov="human" meta={mission.status === "completed" ? "Closed by a person" : "Open"} />
      </StatRow>
      <Card eyebrow="OUTCOMES" prov="posted" title="Required outcomes" subtitle={`${criteria.length} recorded`}>
        <Stack gap={2}>
          {criteria.map((criterion) => (
            <Row key={criterion.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Pill tone={criterion.verified ? "success" : "warning"}>{criterion.verified ? "verified" : "open"}</Pill>
              <span className="ds-grow">{criterion.label}</span>
              <span className="ds-subtle">{criterion.evidenceId ? "evidence attached" : "no evidence"}</span>
            </Row>
          ))}
          {criteria.length === 0 && <span className="ds-subtle">No criterion was recorded, so this mission has nothing to verify against.</span>}
        </Stack>
      </Card>
      {criteria.length > 0 && verified.length < criteria.length && (
        <Notice tone="warning" title="This mission is not complete">
          {criteria.length - verified.length} criteri{criteria.length - verified.length === 1 ? "on is" : "a are"} unverified. Finished agent text is not completion; evidence is.
        </Notice>
      )}
    </Stack>
  );
}

/* ---------------------------- MISSION-011 ---------------------------- */

function MissionTemplates({ context, view }: { context: ScreenContext; view: string }) {
  const templates = useCollection("templates").filter((template) => template.fields.kind === "mission");
  const origin = view === "Company" ? "company" : view === "Industry" ? "industry" : "mine";
  const rows = templates.filter((template) => String(template.fields.origin ?? "company") === origin);

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} template`} icon={<LayoutTemplate size={20} />}>A template is a reusable plan: steps, a team preset and the grants it needs. It never carries an account or a credential.</Empty>;
  }

  return (
    <Grid>
      {rows.map((template) => {
        const body = template.body as { steps?: { title: string; kind: string }[]; team?: string[]; grants?: string[]; note?: string } | undefined;
        return (
          <Card
            key={template.id}
            span={6}
            eyebrow="TEMPLATE"
            prov="human"
            title={template.title}
            subtitle={template.summary}
            actions={<Pill tone={template.status === "published" ? "success" : "neutral"}>{template.status}</Pill>}
            footer={<>
              <Button size="sm" variant="primary" onClick={() => { context.select(template.id); context.openOverlay("approval grant", { id: template.id }); }}>Create from</Button>
              <Button size="sm" variant="secondary" onClick={() => { context.select(template.id); context.openOverlay("Template editor", { id: template.id }); }}>Edit</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(template.id); context.openOverlay("example data", { id: template.id }); }}>Simulate</Button>
            </>}
          >
            <Stack gap={2}>
              <ol className="ds-prose" style={{ paddingInlineStart: "1.2rem" }}>
                {(body?.steps ?? []).map((step) => <li key={step.title}>{step.title} <span className="ds-subtle">({step.kind})</span></li>)}
              </ol>
              <Properties rows={[
                { label: "Grants", value: (body?.grants ?? []).join(", ") || "None" },
                { label: "Last used", value: template.fields.lastUsed ? context.date(String(template.fields.lastUsed)) : "Never" },
              ]} />
              {body?.note && <Notice tone="info">{body.note}</Notice>}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

/* Identity blocks for the overlay head (OverlayDef.summary): the one place a record is named. */
function MissionSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const asked = useRecord(payload?.id ?? context.selectedId ?? context.params.id);
  const mission = asked?.collection === "missions" ? asked : undefined;
  if (!mission) return null;
  const held = mission.status === "paused" || mission.fields.executionPaused === true;
  return (
    <OverlaySummary
      eyebrow="Mission"
      title={mission.title}
      status={<Pill tone={missionTone(mission.status)} dot>{mission.status.replace(/_/g, " ")}</Pill>}
      meta={[mission.ownerName, `Ceiling ${context.money(Number(mission.fields.budgetMinor ?? 0))}`, held && mission.status !== "paused" ? "Dispatch held" : ""]}
    />
  );
}

function TaskSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const asked = useRecord(payload?.id ?? context.selectedId);
  const task = asked?.collection === "missionTasks" ? asked : undefined;
  if (!task) return null;
  return (
    <OverlaySummary
      eyebrow="Task"
      title={task.title}
      status={<Pill tone="neutral" dot>{String(task.fields.stage ?? task.status).replace(/_/g, " ")}</Pill>}
      meta={[String(task.fields.assignee ?? task.ownerName), task.fields.approvalRequired === true ? "Approval gate" : ""]}
    />
  );
}

function DeliverableSummary({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const asked = useRecord(payload?.id ?? context.selectedId);
  const item = asked?.collection === "documents" ? asked : undefined;
  if (!item) return null;
  return (
    <OverlaySummary
      eyebrow="Deliverable"
      title={item.title}
      status={<Pill tone={item.status === "approved" ? "success" : item.status === "published" ? "info" : "neutral"} dot>{String(item.fields.approval ?? item.status).replace(/_/g, " ")}</Pill>}
      meta={[`v${String(item.fields.version ?? 1)}`, item.ownerName]}
    />
  );
}

/** The mission every "This mission" screen is about, named once under the page title. */
function MissionLine({ context }: { context: ScreenContext }) {
  const asked = useRecord(context.params.id);
  const organisation = useRecord(context.org.id);
  const mission = asked?.collection === "missions" ? asked : undefined;
  if (!mission) return null;
  const orgPaused = organisation?.fields.executionPaused === true;
  const held = mission.status === "paused" || mission.fields.executionPaused === true;
  return (
    <Row gap={2} wrap>
      <strong>{mission.title}</strong>
      <Pill tone={missionTone(mission.status)} dot>{mission.status.replace(/_/g, " ")}</Pill>
      {orgPaused && <Pill tone="warning">Organisation paused</Pill>}
      {held && mission.status !== "paused" && !orgPaused && <Pill tone="warning">Dispatch held</Pill>}
      <span className="ds-subtle">{mission.ownerName}</span>
    </Row>
  );
}

function MissionQuickView({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const mission = useRecord(payload?.id ?? context.selectedId);
  const tasks = useCollection("missionTasks").filter((task) => task.parentId === mission?.id);
  const costs = useCollection("missionCosts");
  if (!mission || mission.collection !== "missions") return <Empty title="Choose a mission" />;
  const criteria = criteriaOf(mission);
  return (
    <Stack gap={4}>
      <FactGrid items={[
        { label: "Committed", value: context.money(commitmentMinor(costs, mission.id)), mono: true },
        { label: "Due", value: mission.dueAt ? context.date(mission.dueAt) : "No date", mono: Boolean(mission.dueAt) },
        { label: "Tasks verified", value: `${tasks.filter((task) => String(task.fields.stage) === "verified").length} of ${tasks.length}`, mono: true },
        { label: "Criteria verified", value: `${criteria.filter((criterion) => criterion.verified).length} of ${criteria.length}`, mono: true },
      ]} />
      <p className="ds-prose">{mission.summary}</p>
      <DrawerActions><OverlayActions primary={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`)}>Open</Button>} secondary={<><Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}/execution`)}>Execution</Button></>} end={<OverlayCancel>Cancel</OverlayCancel>} /></DrawerActions>
    </Stack>
  );
}

function CreateMissionOverlay({ context }: { context: ScreenContext }) {
  const templates = useCollection("templates").filter((template) => template.fields.kind === "mission");
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A mission is built in six steps">
        Goal, context, team, plan, permissions and a review. It is created as proposed, and no step runs until a person approves it.
      </Notice>
      <Button variant="primary" onClick={() => { useMissionWizard.getState().reset(); context.navigate(`/o/${context.org.slug}/mission/missions/new`); }}>Start from a blank mission</Button>
      <Stack gap={2}>
        <span className="ds-field-label">Or start from a template</span>
        {templates.map((template) => (
          <Row key={template.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <span className="ds-grow">{template.title}</span>
            <Button size="sm" variant="secondary" onClick={() => {
              const body = template.body as { steps?: { title: string; kind: string }[]; team?: string[]; grants?: string[] } | undefined;
              useMissionWizard.getState().set({
                ...EMPTY_MISSION,
                goal: template.summary,
                steps: (body?.steps ?? []).map((step) => ({ title: step.title, kind: step.kind as "read" })),
                agentIds: body?.team ?? [],
                grants: (body?.grants ?? []).filter((grant) => grant.startsWith("workspace.")),
                templateId: template.id,
              });
              context.navigate(`/o/${context.org.slug}/mission/missions/new`);
            }}>Use</Button>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

function MissionArchive({ context, close }: { context: ScreenContext; close: () => void }) {
  const mission = useRecord(context.selectedId);
  const tasks = useCollection("missionTasks").filter((task) => task.parentId === mission?.id);
  if (!mission || mission.collection !== "missions") return <Empty title="Choose a mission" />;
  const open = tasks.filter((task) => !["verified", "done"].includes(String(task.fields.stage ?? task.status)));
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Archiving stops execution and keeps the record">
        {mission.title} will stay readable with its plan, receipts and costs. No step can be run and no budget committed on it afterwards.
      </Notice>
      {open.length > 0 && <Notice tone="danger" title={`${open.length} open task${open.length === 1 ? "" : "s"}`}>{open.map((task) => task.title).join(", ")} will be archived unfinished, and will show as unresolved on the results.</Notice>}
      <ModalActions><OverlayActions primary={<Button
        variant="danger"
        onClick={async () => {
          if (!(await context.mutate.patch(mission.id, { status: "archived", fields: { ...mission.fields, archivedBy: context.actor } }, { expectRevision: mission.revision, event: `${mission.title} archived by ${context.actor}` }))) return;
          context.toast("Archived", "It stays auditable and cannot be executed.");
          close();
        }}
      >
        Archive the mission
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function SourcePicker({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id);
  const draft = useMissionWizard((state) => state.draft);
  const data = useMissionData();
  return (
    <Stack gap={4}>
      {record ? (
        <Card eyebrow={record.collection.toUpperCase()} prov="human" title={record.title} subtitle={record.summary}>
          <Properties rows={[
            { label: "Status", value: record.status },
            { label: "Updated", value: context.dateTime(record.updatedAt) },
          ]} />
        </Card>
      ) : <span className="ds-subtle">Choose a record on the Context step to inspect it.</span>}
      <Card eyebrow="IN SCOPE" prov="human" title="Attached to this mission" subtitle={`${draft.contextIds.length} records`}>
        <Stack gap={1}>
          {draft.contextIds.map((id) => {
            const found = Object.values(data).flat().find((item) => (item as Rec).id === id) as Rec | undefined;
            return <Row key={id} gap={2}><span className="ds-grow ds-truncate">{found?.title ?? id}</span><span className="ds-subtle">{found?.collection}</span></Row>;
          })}
          {draft.contextIds.length === 0 && <span className="ds-subtle">Nothing attached yet.</span>}
        </Stack>
      </Card>
    </Stack>
  );
}

function TeamSelector({ context }: { context: ScreenContext }) {
  const data = useMissionData();
  return (
    <Stack gap={3}>
      <Notice tone="info" title="What each contract may do">
        A mission cannot give an AI employee a tool its contract does not hold. Grants shown here are the limit.
      </Notice>
      {data.agents.map((agent) => {
        const body = agent.body as { tools?: { id: string; granted: boolean }[]; authority?: string[] } | undefined;
        return (
          <Card key={agent.id} eyebrow="AI EMPLOYEE" prov="agent" pad="tight" title={agent.title} subtitle={String(agent.fields.role ?? "")}>
            <Properties rows={[
              { label: "Status", value: agent.status },
              { label: "Granted tools", value: (body?.tools ?? []).filter((tool) => tool.granted).map((tool) => tool.id).join(", ") || "None" },
              { label: "Authority", value: (body?.authority ?? []).join("; ") || "Not recorded" },
            ]} />
          </Card>
        );
      })}
      <Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents`)}>Open the directory</Button>
    </Stack>
  );
}

function RiskReview({ context }: { context: ScreenContext }) {
  const draft = useMissionWizard((state) => state.draft);
  const risks = useCollection("risks");
  const providerSteps = draft.steps.filter((step) => step.kind === "provider");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Provider steps in the plan", value: String(providerSteps.length) },
        { label: "Ceiling", value: context.money(draft.budgetMinor) },
        { label: "Target chosen", value: draft.targetId ? "Yes" : "No" },
        { label: "Grants requested", value: draft.grants.join(", ") || "None" },
      ]} />
      {providerSteps.length > 0 && (
        <Notice tone="warning" title="This plan contains steps that cannot complete">
          {providerSteps.map((step) => step.title).join(", ")} would need a connected provider. They will stop at the boundary and record why, so the mission can never report them as done.
        </Notice>
      )}
      {risks.length > 0 && (
        <Card eyebrow="RISK REGISTER" prov="human" title="Open risks in this workspace" pad="tight">
          <Stack gap={1}>
            {risks.map((risk) => <Row key={risk.id} gap={2}><span className="ds-grow">{risk.title}</span><Pill tone="warning">{risk.status}</Pill></Row>)}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function ApprovalSheet({ context, close }: { context: ScreenContext; close: () => void }) {
  const draft = useMissionWizard((state) => state.draft);
  const reset = useMissionWizard((state) => state.reset);
  const data = useMissionData();
  const problems = WIZARD_STEPS.flatMap((step) => wizardProblems(draft, step));
  return (
    <Stack gap={4}>
      {problems.length > 0 ? (
        <Notice tone="danger" title="This mission cannot be submitted yet">
          <ul style={{ paddingInlineStart: "1.1rem" }}>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </Notice>
      ) : (
        <Notice tone="success" title="Ready to propose">
          A named target, a bounded ceiling, a team and a plan of typed steps. It is created as proposed; approval is a separate decision.
        </Notice>
      )}
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={problems.length > 0}
        onClick={async () => {
          const criteria = draft.successCriteria.split("\n").filter(Boolean).map((label, index) => ({ id: `c${index + 1}`, label, verified: false }));
          const mission = await context.mutate.create({
            collection: "missions",
            title: draft.goal.slice(0, 70),
            status: "proposed",
            summary: draft.goal,
            amountMinor: draft.budgetMinor,
            dueAt: draft.dueAt || undefined,
            fields: {
              agentId: draft.agentIds[0] ?? "",
              budgetMinor: draft.budgetMinor,
              committedMinor: 0,
              spentMinor: 0,
              targetId: draft.targetId,
              departmentId: draft.departmentId,
              planVersion: 1,
              grants: draft.grants.join(","),
              templateId: draft.templateId ?? "",
            },
            body: { criteria, context: draft.contextIds },
          }, `Mission proposed: ${draft.goal.slice(0, 50)}`);
          for (const [index, step] of draft.steps.entries()) {
            const operation = OPERATIONS.find((item) => item.label === step.title);
            await context.mutate.create({
              collection: "missionSteps",
              title: step.title,
              status: index === 0 ? "ready" : "todo",
              parentId: mission.id,
              summary: operation?.note ?? "Step recorded from the plan.",
              fields: { order: index + 1, kind: step.kind, capability: step.capability ?? "", attempts: 0, operation: operation?.id ?? "" },
              body: { output: "", reason: "", inputs: [] },
            }, `Step recorded: ${step.title}`);
          }
          for (const [index, agentId] of draft.agentIds.entries()) {
            const agent = data.agents.find((item) => item.id === agentId);
            await context.mutate.create({
              collection: "missionTasks",
              title: `Work for ${agent?.title ?? "the team"}`,
              status: "todo",
              parentId: mission.id,
              summary: "Created with the mission. Scope it on the plan.",
              fields: { stage: "todo", assignee: agent?.title ?? context.actor, kind: agent ? "ai" : "human", order: index + 1, estimateHours: 1, approvalRequired: false },
              body: { dependsOn: [], evidence: [] },
            }, "Mission task created");
          }
          reset();
          context.toast("Mission proposed", `${mission.title} is proposed with ${draft.steps.length} steps. Nothing runs until it is approved.`);
          close();
          context.navigate(`/o/${context.org.slug}/mission/missions/${mission.id}`);
        }}
      >
        Submit for approval
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function StatusExplanation({ context }: { context: ScreenContext }) {
  const { mission, tasks, steps, receipts } = useMission(context);
  if (!mission) return <Empty title="No mission" />;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="How this status is computed">
        Status comes from records, never from an agent saying it is finished.
      </Notice>
      <Properties rows={[
        { label: "Status on the record", value: mission.status },
        { label: "Tasks verified", value: `${tasks.filter((task) => String(task.fields.stage) === "verified").length} of ${tasks.length}` },
        { label: "Steps run", value: `${steps.filter((step) => step.status === "done").length} of ${steps.length}` },
        { label: "Steps stopped", value: String(steps.filter((step) => ["blocked", "failed", "unknown_side_effect"].includes(step.status)).length) },
        { label: "Receipts", value: String(receipts.length) },
        { label: "Criteria verified", value: `${criteriaOf(mission).filter((criterion) => criterion.verified).length} of ${criteriaOf(mission).length}` },
      ]} />
      <Notice tone="warning" title="Completed means verified">
        A mission is only completed when every criterion carries evidence. Text from an AI employee saying the work is done does not move this status.
      </Notice>
    </Stack>
  );
}

function PauseDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission, steps } = useMission(context);
  const [reason, setReason] = useState("");
  if (!mission) return <Empty title="No mission" />;
  const running = steps.filter((step) => step.status === "running");
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Pausing stops the next step, not a running one">
        Steps here run one at a time and finish in this browser immediately. {running.length === 0 ? "Nothing is mid-flight." : `${running.length} step is mid-flight and will finish.`} Pausing prevents the next step being started.
      </Notice>
      <Field label="Why" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!reason.trim()}
        onClick={async () => {
          if (!(await context.mutate.patch(mission.id, {
            status: mission.status === "paused" ? "running" : "paused",
            fields: { ...mission.fields, executionPaused: mission.status !== "paused", pauseReason: reason },
          }, { expectRevision: mission.revision, event: `${mission.title} ${mission.status === "paused" ? "resumed" : "paused"} by ${context.actor}` }))) return;
          context.toast(mission.status === "paused" ? "Resumed" : "Paused", `${mission.title} is ${mission.status === "paused" ? "running" : "paused"}, with your reason on the record.`);
          close();
        }}
      >
        {mission.status === "paused" ? "Resume the mission" : "Pause the mission"}
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function AmendmentRequest({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission } = useMission(context);
  const [change, setChange] = useState("");
  const [amount, setAmount] = useState(0);
  if (!mission) return <Empty title="No mission" />;
  return (
    <form
      id="amendment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "missionCosts",
          title: `Amendment requested by ${context.actor}`,
          status: "requested",
          parentId: mission.id,
          at: context.now.toISOString(),
          amountMinor: amount,
          summary: change,
          fields: { kind: "amendment", missionId: mission.id, source: "Amendment request", requestedBy: context.actor },
        }, `Amendment requested on ${mission.title}`);
        context.toast("Amendment recorded", "It waits for an approver. The ceiling is unchanged until then.");
        close();
      }}
    >
      <Notice tone="info" title="An amendment is a request, not a change">
        The ceiling and scope stay as they are until someone with approval authority accepts it.
      </Notice>
      <Field label="What should change" required><TextArea value={change} rows={3} onChange={(event) => setChange(event.target.value)} required /></Field>
      <Field label={`Extra ceiling (${context.org.currency})`}>
        <TextInput value={(amount / 100).toFixed(2)} align="end" inputMode="decimal" onChange={(event) => setAmount(Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100))} />
      </Field>
    </form>
  );
}

function TaskInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const { tasks } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = tasks.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [dependency, setDependency] = useState("");
  if (!task) return <Empty title="Choose a task" />;
  const deps = dependenciesOf(task);
  const cycle = dependency ? wouldCycle(tasks, dependency, task.id) : null;
  return (
    <Stack gap={4}>
      <FactGrid items={[
        { label: "Estimate", value: task.fields.estimateHours ? `${String(task.fields.estimateHours)} h` : "Not estimated", mono: Boolean(task.fields.estimateHours) },
        { label: "Risk", value: String(task.fields.risk || "None recorded") },
      ]} />
      <OverlaySection title="Runs after">
        <Stack gap={2}>
          {deps.map((id) => (
            <Row key={id} gap={2}>
              <span className="ds-grow">{tasks.find((item) => item.id === id)?.title ?? id}</span>
              <Button size="sm" variant="ghost" onClick={async () => {
                if (!(await context.mutate.patch(task.id, { body: { ...(task.body as object), dependsOn: deps.filter((item) => item !== id) } }, { expectRevision: task.revision, event: `Dependency removed from ${task.title}` }))) return;
                context.toast("Dependency removed", "The plan graph and the list both reflect it.");
              }}>Remove</Button>
            </Row>
          ))}
          {deps.length === 0 && <span className="ds-subtle">Nothing. This task can start.</span>}
        </Stack>
      </OverlaySection>
      <Field label="Add a dependency" error={cycle ? `That would create a cycle: ${cycle.map((id) => tasks.find((item) => item.id === id)?.title ?? id).join(" → ")}` : undefined}>
        <Select value={dependency} onChange={(event) => setDependency(event.target.value)}>
          <option value="">Choose a task…</option>
          {tasks.filter((item) => item.id !== task.id && !deps.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <DrawerActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!dependency || Boolean(cycle)}
        onClick={async () => {
          if (!(await context.mutate.patch(task.id, { body: { ...(task.body as object), dependsOn: [...deps, dependency] } }, { expectRevision: task.revision, event: `Dependency added to ${task.title}` }))) return;
          context.toast("Dependency added", "The task now waits for it. A cycle would have been refused.");
          close();
        }}
      >
        Add dependency
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></DrawerActions>
    </Stack>
  );
}

function PlanRevision({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission, tasks } = useMission(context);
  if (!mission) return <Empty title="No mission" />;
  const version = Number(mission.fields.planVersion ?? 1);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A published plan version is immutable">
        Version {version} produced the receipts already recorded. Revising the plan creates version {version + 1}; the old one stays readable so the receipts still make sense.
      </Notice>
      <Properties rows={[
        { label: "Current version", value: String(version) },
        { label: "Tasks", value: String(tasks.length) },
        { label: "Dependencies", value: String(tasks.reduce((sum, task) => sum + dependenciesOf(task).length, 0)) },
      ]} />
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          if (!(await context.mutate.patch(mission.id, { fields: { ...mission.fields, planVersion: version + 1, revisedBy: context.actor } }, { expectRevision: mission.revision, event: `${mission.title} plan revised to version ${version + 1}` }))) return;
          context.toast("Plan revised", `Version ${version + 1} is current. Version ${version} stays on the record with its receipts.`);
          close();
        }}
      >
        Publish version {version + 1}
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function ScopeChangeApproval({ context }: { context: ScreenContext }) {
  const { mission, tasks } = useMission(context);
  if (!mission) return <Empty title="No mission" />;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Scope changes need the same authority as the mission">
        Adding work beyond the approved goal is an amendment, recorded with who asked and who approved.
      </Notice>
      <Properties rows={[
        { label: "Approved goal", value: mission.summary },
        { label: "Tasks now", value: String(tasks.length) },
        { label: "Ceiling", value: context.money(Number(mission.fields.budgetMinor ?? 0)) },
        { label: "Your role view", value: context.can("approve_mission") ? "Can approve" : "Cannot approve" },
      ]} />
      <ModalActions><OverlayActions primary={<Button variant="secondary" onClick={() => { context.closeOverlay(); context.openOverlay("amendment request"); }}>Request an amendment</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function TaskDetail({ context }: { context: ScreenContext }) {
  const { tasks } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = tasks.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [evidence, setEvidence] = useState("");
  const orgRecords = useCollections(["documents", "missionTasks"]);
  if (!task) return <Empty title="Choose a task" />;
  const body = task.body as { evidence?: string[] } | undefined;
  /* Evidence is a real record in this organisation that is not already attached and is not the task itself. */
  const evidenceOptions = [...orgRecords.documents, ...orgRecords.missionTasks].filter((record) => record.id !== task.id && !(body?.evidence ?? []).includes(record.id));
  return (
    <Stack gap={4}>
      <FactGrid items={[{ label: "Evidence attached", value: String((body?.evidence ?? []).length), mono: true }]} />
      <p className="ds-prose">{task.summary}</p>
      <Field label="Attach evidence" hint="A document or task in this organisation that shows the work was done.">
        <Select aria-label="Attach evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)}>
          <option value="">Choose a record…</option>
          {evidenceOptions.map((record) => <option key={record.id} value={record.id}>{record.title} · {record.collection === "documents" ? "document" : "task"}</option>)}
        </Select>
      </Field>
      <DrawerActions><OverlayActions primary={<Button
          variant="primary"
          disabled={!evidenceOptions.some((record) => record.id === evidence)}
          onClick={async () => {
            if (!evidenceOptions.some((record) => record.id === evidence)) return;
            if (!(await context.mutate.patch(task.id, { body: { ...(task.body as object), evidence: [...(body?.evidence ?? []), evidence] } }, { expectRevision: task.revision, event: `Evidence attached to ${task.title}` }))) return;
            context.toast("Evidence attached", "It is on the task and shows on the mission results.");
            setEvidence("");
          }}
        >
          Attach
        </Button>} secondary={<><Button variant="secondary" onClick={() => { context.closeOverlay(); context.openOverlay("reassign", { id: task.id }); }}>Reassign</Button></>} end={<OverlayCancel>Close</OverlayCancel>} /></DrawerActions>
    </Stack>
  );
}

function ReassignTask({ context, close }: { context: ScreenContext; close: () => void }) {
  const { data, tasks } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = tasks.find((item) => item.id === (payload?.id ?? context.selectedId));
  const candidates = [...data.agents.filter((agent) => agent.status === "active"), ...data.members];
  const [picked, setPicked] = useState("");
  const to = picked || candidates[0]?.title || "";
  if (!task) return <Empty title="Choose a task" />;
  return (
    <Stack gap={4}>
      <Field label="Assign to">
        <Select value={to} onChange={(event) => setPicked(event.target.value)}>
          {candidates.map((candidate) => <option key={candidate.id} value={candidate.title}>{candidate.title} — {candidate.collection === "agents" ? "AI employee" : "person"}</option>)}
        </Select>
      </Field>
      <Notice tone="info" title="A paused contract is not offered">
        Only active contracts and people appear here, because a paused contract is excluded from delegation.
      </Notice>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          const isAgent = data.agents.some((agent) => agent.title === to);
          if (!(await context.mutate.patch(task.id, { ownerName: to, fields: { ...task.fields, assignee: to, kind: isAgent ? "ai" : "human" } }, { expectRevision: task.revision, event: `${task.title} reassigned to ${to}` }))) return;
          context.toast("Reassigned", `${to} owns ${task.title}.`);
          close();
        }}
      >
        Reassign
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function MoveImpact({ context }: { context: ScreenContext }) {
  const { tasks } = useMission(context);
  const task = tasks.find((item) => item.id === context.selectedId);
  if (!task) return <Empty title="Choose a task" />;
  const dependents = tasks.filter((item) => dependenciesOf(item).includes(task.id));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Task", value: task.title },
        { label: "Lane", value: String(task.fields.stage) },
        { label: "Tasks waiting on it", value: String(dependents.length) },
        { label: "Approval gate", value: task.fields.approvalRequired === true ? "Yes — a move to Verified needs a recorded review" : "No" },
      ]} />
      {dependents.length > 0 && (
        <Notice tone="info" title="What would unblock">
          {dependents.map((item) => item.title).join(", ")} become startable once this is verified.
        </Notice>
      )}
      <Notice tone="warning" title="A move never executes anything">
        Moving a card changes the record's stage. It does not run a step, send anything or pass an approval.
      </Notice>
    </Stack>
  );
}

function ActionReceipt({ context }: { context: ScreenContext }) {
  const { receipts, steps } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const stepId = payload?.id ?? context.selectedId;
  const rows = receipts.filter((receipt) => receipt.fields.stepId === stepId);
  const step = steps.find((item) => item.id === stepId);
  return (
    <Stack gap={4}>
      {step && <Card eyebrow="STEP" prov="posted" title={step.title} subtitle={`${step.status.replace(/_/g, " ")} · ${String(step.fields.attempts ?? 0)} attempts`} />}
      {rows.length === 0 ? <Empty title="No receipt yet" >A receipt is written every time a step runs, including when it stops at a boundary.</Empty> : rows.map((receipt) => {
        const body = receipt.body as { request?: string; response?: string; reason?: string; read?: string[] } | undefined;
        return (
          <Card key={receipt.id} eyebrow="RECEIPT" prov={receipt.status === "recorded" ? "posted" : "unknown"} title={receipt.title}
            subtitle={`${context.dateTime(receipt.at ?? receipt.updatedAt)} · attempt ${String(receipt.fields.attempt ?? 1)}`}
            actions={<Pill tone={receipt.status === "recorded" ? "success" : "warning"}>{String(receipt.fields.state).replace(/_/g, " ")}</Pill>}>
            <Properties rows={[
              { label: "Requested", value: <code className="ds-num">{body?.request || "—"}</code> },
              { label: "Response", value: body?.response || "None" },
              { label: "Records read", value: String((body?.read ?? []).length) },
              { label: "Actor", value: String(receipt.fields.actor ?? "—") },
              ...(body?.reason ? [{ label: "Why it stopped", value: body.reason }] : []),
            ]} />
          </Card>
        );
      })}
    </Stack>
  );
}

function RetryConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission, steps } = useMission(context);
  const { now, money, date } = useWorkspace();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const step = steps.find((item) => item.id === (payload?.id ?? context.selectedId));
  const pool = useOrgRecords();
  if (!step || !mission) return <Empty title="Choose a step" />;
  const safe = isRetrySafe(step);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Step", value: step.title },
        { label: "Kind", value: String(step.fields.kind) },
        { label: "Attempts", value: String(step.fields.attempts ?? 0) },
        { label: "Retry safe", value: safe ? "Yes — it only reads or writes records here" : "No" },
      ]} />
      {!safe && <Notice tone="danger" title="This step cannot be retried">{blockedReason(step) ?? "The outcome of the last attempt is unknown."}</Notice>}
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!safe}
        onClick={async () => {
          await executeStep(context, step, mission, pool, money, date, now);
          close();
        }}
      >
        Retry the step
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function ExecutionTrace({ context }: { context: ScreenContext }) {
  const { steps, receipts } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const step = steps.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!step) return <Empty title="Choose a step" />;
  const body = step.body as { output?: string; reason?: string; inputs?: string[] } | undefined;
  const operation = operationFor(String(step.fields.operation ?? ""));
  const stepReceipts = receipts.filter((receipt) => receipt.fields.stepId === step.id);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Operation", value: <code className="ds-num">{String(step.fields.operation ?? "—")}</code> },
        { label: "What it does", value: operation?.note ?? "Not implemented by the local interpreter" },
        { label: "Kind", value: String(step.fields.kind) },
        { label: "State", value: <Pill tone={step.status === "done" ? "success" : "warning"}>{step.status.replace(/_/g, " ")}</Pill> },
        { label: "Attempts", value: String(step.fields.attempts ?? 0) },
        { label: "Last run", value: step.fields.lastRunAt ? context.dateTime(String(step.fields.lastRunAt)) : "Never" },
        { label: "Records read", value: String((body?.inputs ?? []).length) },
      ]} />
      {body?.output && <Card eyebrow="OUTPUT" prov="posted" title="What it produced" pad="tight"><p className="ds-prose">{body.output}</p></Card>}
      {body?.reason && <Notice tone="warning" title="Why it stopped">{body.reason}</Notice>}
      <Card eyebrow="RECEIPTS" prov="posted" title={`${stepReceipts.length} receipts`} pad="tight">
        <Stack gap={1}>
          {stepReceipts.map((receipt) => (
            <Row key={receipt.id} gap={2}>
              <span className="ds-grow ds-truncate">{receipt.title}</span>
              <span className="ds-subtle ds-num">attempt {String(receipt.fields.attempt ?? 1)}</span>
              <Pill tone={receipt.status === "recorded" ? "success" : "warning"}>{String(receipt.fields.state).replace(/_/g, " ")}</Pill>
            </Row>
          ))}
          {stepReceipts.length === 0 && <span className="ds-subtle">No receipt yet.</span>}
        </Stack>
      </Card>
    </Stack>
  );
}

function AgentSelectorOverlay({ context }: { context: ScreenContext }) {
  const { data, mission } = useMission(context);
  return (
    <Stack gap={3}>
      <Notice tone="info" title="A mention records a request">
        It does not give a contract a tool, and it does not start anything. The request shows in the room with who asked.
      </Notice>
      {data.agents.filter((agent) => agent.status === "active").map((agent) => (
        <Row key={agent.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Avatar name={agent.title} kind="ai" size="sm" />
          <div className="ds-grow"><strong>{agent.title}</strong><div className="ds-subtle">{String(agent.fields.role ?? "")}</div></div>
          <Button size="sm" variant="secondary" onClick={async () => {
            if (!mission) return;
            await context.mutate.create({
              collection: "messages",
              title: `Request to ${agent.title}`,
              status: "posted",
              summary: `${context.actor} asked ${agent.title} for help on this mission. Nothing is started by the request.`,
              parentId: mission.id,
              at: context.now.toISOString(),
              fields: { author: context.actor, kind: "human", room: "mission", requestTo: agent.title },
            }, `Request recorded to ${agent.title}`);
            context.toast("Request recorded", `${agent.title} is named on the request in the room.`);
          }}>Request</Button>
        </Row>
      ))}
    </Stack>
  );
}

function HandoffView({ context, close }: { context: ScreenContext; close: () => void }) {
  const { tasks, data } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = tasks.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [pickedReviewer, setPickedReviewer] = useState("");
  const reviewer = pickedReviewer || data.members.find((member) => member.fields.kind !== "ai")?.title || "";
  if (!task) return <Empty title="Choose a task" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Task", value: task.title },
        { label: "Owner", value: String(task.fields.assignee ?? task.ownerName) },
        { label: "Deliverable expected", value: task.summary },
      ]} />
      <Field label="Reviewer">
        <Select value={reviewer} onChange={(event) => setPickedReviewer(event.target.value)}>
          {data.members.filter((member) => member.fields.kind !== "ai").map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={async () => {
          if (!(await context.mutate.patch(task.id, { fields: { ...task.fields, reviewer, approvalRequired: true } }, { expectRevision: task.revision, event: `Review requested on ${task.title} from ${reviewer}` }))) return;
          context.toast("Review requested", `${reviewer} is recorded as the reviewer, and the task now has a gate.`);
          close();
        }}
      >
        Request the review
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function MissionDecisionRecord({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission } = useMission(context);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  if (!mission) return <Empty title="No mission" />;
  return (
    <form
      id="mission-decision"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "decisions",
          title: title.trim(),
          status: "approved",
          summary: rationale.slice(0, 160),
          at: context.now.toISOString(),
          fields: { approvers: context.actor, domain: "mission", missionId: mission.id, approvedAt: context.now.toISOString().slice(0, 10) },
          body: { rationale, alternatives: [], outcome: "" },
        }, `Decision recorded on ${mission.title}`);
        context.toast("Decision recorded", "It is in the decision register and on this mission.");
        close();
      }}
    >
      <Field label="Decision" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Why" required><TextArea value={rationale} rows={3} onChange={(event) => setRationale(event.target.value)} required /></Field>
    </form>
  );
}

function ArtifactPreviewOverlay({ context }: { context: ScreenContext }) {
  const { deliverables } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = deliverables.find((document) => document.id === (payload?.id ?? context.selectedId));
  if (!item) return <Empty title="Choose a deliverable" />;
  const body = item.body as { text?: string } | undefined;
  return (
    <Stack gap={4}>
      <FactGrid items={[{ label: "Produced by", value: String(item.fields.producedBy ?? item.ownerName) }]} />
      <article className="ds-panel ds-prose" style={{ padding: "var(--space-4)", whiteSpace: "pre-wrap" }}>{body?.text ?? item.summary}</article>
      <DrawerActions><OverlayActions primary={<Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/docs/documents/${item.id}`)}>Open in Documents</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></DrawerActions>
    </Stack>
  );
}

function DeliverableApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const { deliverables, mission } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = deliverables.find((document) => document.id === (payload?.id ?? context.selectedId));
  const [note, setNote] = useState("");
  if (!item || !mission) return <Empty title="Choose a deliverable" />;
  const allowed = context.can("approve_mission");
  return (
    <Stack gap={4}>
      {!allowed && <Notice tone="warning" title="This role view does not approve">Your verdict will be recorded as a note instead.</Notice>}
      <Field label="What you checked" required><TextArea value={note} rows={3} onChange={(event) => setNote(event.target.value)} required /></Field>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!note.trim()}
        onClick={async () => {
          if (allowed) {
            if (!(await context.mutate.patch(item.id, { status: "approved", fields: { ...item.fields, approval: "approved", approvedBy: context.actor, approvalNote: note } }, { expectRevision: item.revision, event: `${item.title} approved by ${context.actor}` }))) return;
          } else {
            await context.mutate.log(`${context.actor} reviewed ${item.title}: ${note}`, { entityId: item.id, type: "deliverable.note" });
          }
          context.toast(allowed ? "Approved" : "Note recorded", allowed ? `${item.title} is approved, with your note on the record.` : "The role view cannot approve, so the note stands instead.");
          close();
        }}
      >
        {allowed ? "Approve" : "Record a note"}
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function VersionDiff({ context }: { context: ScreenContext }) {
  const { deliverables } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = deliverables.find((document) => document.id === (payload?.id ?? context.selectedId));
  const versions = (item?.body as { versions?: { version: number; at: string; author: string; summary: string }[] } | undefined)?.versions ?? [];
  if (!item) return <Empty title="Choose a deliverable" />;
  return versions.length === 0 ? <Notice tone="info">This deliverable has one version.</Notice> : (
    <DataGrid
      rows={versions}
      rowId={(row) => String(row.version)}
      label="Versions"
      filterable={false}
      columns={[
        { key: "version", header: "Version", primary: true, cell: (row) => `v${row.version}` },
        { key: "at", header: "Saved", cell: (row) => context.dateTime(row.at) },
        { key: "author", header: "Author", cell: (row) => row.author },
        { key: "summary", header: "What changed", cell: (row) => row.summary },
      ]}
    />
  );
}

function PublishVerification({ context }: { context: ScreenContext }) {
  const { deliverables } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const item = deliverables.find((document) => document.id === (payload?.id ?? context.selectedId));
  return (
    <Stack gap={4}>
      <CapabilityLine id="document.publish" title="Publishing outside this workspace is not connected" />
      <Properties rows={[
        { label: "Deliverable", value: item?.title ?? "—" },
        { label: "Inside this workspace", value: "Visible to role views that open Missions" },
        { label: "Outside", value: <Pill tone="warning">Not possible</Pill> },
      ]} />
      <Notice tone="danger" title="A published result is not undone by editing the draft">
        If this were published externally, editing this record afterwards would change nothing out there. That is why publication needs its own mission scope and a verification step.
      </Notice>
    </Stack>
  );
}

function BudgetVariance({ context }: { context: ScreenContext }) {
  const { mission, costs } = useMission(context);
  if (!mission) return <Empty title="No mission" />;
  const ceiling = Number(mission.fields.budgetMinor ?? 0);
  const committed = costs.filter((cost) => cost.fields.kind === "commitment").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const spent = costs.filter((cost) => cost.fields.kind === "spend").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Ceiling", value: context.money(ceiling) },
        { label: "Committed", value: context.money(committed) },
        { label: "Spent", value: context.money(spent) },
        { label: "Variance against ceiling", value: context.money(ceiling - committed - spent) },
        { label: "Forecast to completion", value: "Unavailable — no run-rate exists to project" },
      ]} />
      <Notice tone="info" title="Variance is arithmetic, not a forecast">
        Every figure above is a sum of recorded entries. Nothing is projected, because nothing in this workspace has a rate to project from.
      </Notice>
    </Stack>
  );
}

function LimitIncrease({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission, costs } = useMission(context);
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState("");
  if (!mission) return <Empty title="No mission" />;
  const ceiling = Number(mission.fields.budgetMinor ?? 0);
  const committed = costs.filter((cost) => cost.fields.kind === "commitment").reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const allowed = context.can("approve_mission");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Current ceiling", value: context.money(ceiling) },
        { label: "Committed", value: context.money(committed) },
        { label: "Headroom", value: context.money(ceiling - committed) },
      ]} />
      <Field label={`Increase by (${context.org.currency})`} required>
        <TextInput value={(amount / 100).toFixed(2)} align="end" inputMode="decimal" onChange={(event) => setAmount(Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100))} />
      </Field>
      <Field label="Why" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      {!allowed && <Notice tone="warning" title="This role view cannot raise a ceiling">The request will be recorded for an approver.</Notice>}
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={amount <= 0 || !reason.trim()}
        onClick={async () => {
          if (allowed) {
            if (!(await context.mutate.patch(mission.id, { fields: { ...mission.fields, budgetMinor: ceiling + amount }, amountMinor: ceiling + amount }, { expectRevision: mission.revision, event: `Ceiling raised to ${context.money(ceiling + amount)} by ${context.actor}: ${reason}` }))) return;
            context.toast("Ceiling raised", `${context.money(ceiling + amount)} is the new ceiling, recorded with your reason.`);
          } else {
            await context.mutate.create({
              collection: "missionCosts",
              title: `Ceiling increase requested by ${context.actor}`,
              status: "requested",
              parentId: mission.id,
              at: context.now.toISOString(),
              amountMinor: amount,
              summary: reason,
              fields: { kind: "amendment", missionId: mission.id, source: "Ceiling request", requestedBy: context.actor },
            }, "Ceiling increase requested");
            context.toast("Request recorded", "An approver decides. The ceiling is unchanged.");
          }
          close();
        }}
      >
        {allowed ? "Raise the ceiling" : "Record the request"}
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function CostSource({ context }: { context: ScreenContext }) {
  const { costs } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const cost = costs.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!cost) return <Empty title="Choose an entry" />;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Entry", value: cost.title },
        { label: "Kind", value: String(cost.fields.kind) },
        { label: "Amount", value: context.money(cost.amountMinor) },
        { label: "Source", value: String(cost.fields.source ?? "—") },
        { label: "Approved by", value: String(cost.fields.approvedBy || "Not approved") },
        { label: "Recorded", value: context.dateTime(cost.at ?? cost.updatedAt) },
      ]} />
      <p className="ds-prose">{cost.summary}</p>
      {String(cost.fields.kind) === "provider" && <CapabilityLine id="model.inference" title="No provider charge exists" />}
    </Stack>
  );
}

function ResultsApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission } = useMission(context);
  if (!mission) return <Empty title="No mission" />;
  const criteria = criteriaOf(mission);
  const unverified = criteria.filter((criterion) => !criterion.verified);
  const allowed = context.can("approve_mission");
  return (
    <Stack gap={4}>
      {unverified.length > 0 ? (
        <Notice tone="danger" title={`${unverified.length} criteri${unverified.length === 1 ? "on is" : "a are"} unverified`}>
          {unverified.map((criterion) => criterion.label).join("; ")}. A mission cannot be closed as complete while a criterion has no evidence.
        </Notice>
      ) : (
        <Notice tone="success" title="Every criterion carries evidence">Closing records who decided and when.</Notice>
      )}
      <Button
        variant="primary"
        disabled={unverified.length > 0 || !allowed}
        title={allowed ? undefined : "This role view does not approve missions"}
        onClick={async () => {
          if (!(await context.mutate.patch(mission.id, { status: "completed", fields: { ...mission.fields, closedBy: context.actor, closedAt: context.now.toISOString() } }, { expectRevision: mission.revision, event: `${mission.title} closed as complete by ${context.actor}` }))) return;
          context.toast("Mission closed", "Completion is recorded against verified criteria, not agent text.");
          close();
        }}
      >
        Close as complete
      </Button>
    </Stack>
  );
}

function ReopenTask({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission, tasks } = useMission(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = tasks.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [reason, setReason] = useState("");
  if (!mission) return <Empty title="No mission" />;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A follow-up is a new task, not a rewrite">
        The original task keeps its history. The follow-up carries your reason so a reader can see why the work came back.
      </Notice>
      <Field label="Why it is unresolved" required><TextArea value={reason} rows={3} onChange={(event) => setReason(event.target.value)} required /></Field>
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        disabled={!reason.trim()}
        onClick={async () => {
          /* The follow-up and the mission reopening are one change. */
          if (!(await commitTogether(context, [
            {
              create: {
                collection: "missionTasks",
                title: `Follow-up: ${task?.title ?? mission.title}`,
                status: "todo",
                parentId: mission.id,
                summary: reason,
                fields: { stage: "todo", assignee: context.actor, kind: "human", order: tasks.length + 1, estimateHours: 1, approvalRequired: false, followUpOf: task?.id ?? "" },
                body: { dependsOn: [], evidence: [] },
              },
              event: `Follow-up created on ${mission.title}`,
            },
            ...(mission.status === "completed" ? [{ record: mission, patch: { status: "running", fields: { ...mission.fields, reopenedBy: context.actor } }, event: `${mission.title} reopened by ${context.actor}` }] : []),
          ]))) return;
          context.toast("Follow-up created", "It is on the board with your reason.");
          close();
        }}
      >
        Create the follow-up
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

function TemplateEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const templates = useCollection("templates");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = templates.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [title, setTitle] = useState(template?.title ?? "");
  const [summary, setSummary] = useState(template?.summary ?? "");
  return (
    <form
      id="template-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (template) {
          if (!(await context.mutate.patch(template.id, { title, summary }, { expectRevision: template.revision, event: `Template updated: ${title}` }))) return;
        } else {
          await context.mutate.create({
            collection: "templates",
            title,
            status: "draft",
            summary,
            fields: { kind: "mission", origin: "mine", steps: 0, lastUsed: "" },
            body: { steps: [], team: [], grants: ["workspace.read"], note: "A template carries no account and no credential." },
          }, `Template created: ${title}`);
        }
        context.toast("Template saved", "It is a record in this workspace.");
        close();
      }}
    >
      <Field label="Template" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="What it is for" required><TextArea value={summary} rows={3} onChange={(event) => setSummary(event.target.value)} required /></Field>
      <Notice tone="info" title="Templates never carry credentials or approvals">
        A template holds steps, a team preset and the tool grants it needs. Accounts, approvals and anything time-limited are left out deliberately.
      </Notice>
    </form>
  );
}

function ExampleData({ context }: { context: ScreenContext }) {
  const templates = useCollection("templates");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = templates.find((item) => item.id === (payload?.id ?? context.selectedId));
  const body = template?.body as { steps?: { title: string; kind: string }[] } | undefined;
  if (!template) return <Empty title="Choose a template" />;
  const providerSteps = (body?.steps ?? []).filter((step) => step.kind === "provider");
  return (
    <Stack gap={4}>
      <Notice tone="info" title="A simulation names what would happen, step by step">
        Nothing runs. Read and compute steps would read records here; a provider step would stop at the boundary.
      </Notice>
      <Stack gap={2}>
        {(body?.steps ?? []).map((step, index) => (
          <Row key={step.title} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
            <strong className="ds-num">{index + 1}</strong>
            <span className="ds-grow">{step.title}</span>
            <Pill tone={step.kind === "provider" ? "warning" : "neutral"}>{step.kind === "provider" ? "would stop" : "would run locally"}</Pill>
          </Row>
        ))}
      </Stack>
      {providerSteps.length === 0 && <Notice tone="success">Every step in this template can run in this workspace.</Notice>}
    </Stack>
  );
}

function ApprovalGrant({ context, close }: { context: ScreenContext; close: () => void }) {
  const templates = useCollection("templates");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = templates.find((item) => item.id === (payload?.id ?? context.selectedId));
  const body = template?.body as { steps?: { title: string; kind: string }[]; team?: string[]; grants?: string[] } | undefined;
  if (!template) return <Empty title="Choose a template" />;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Nothing is carried forward but the shape">
        Grants are re-requested when the new mission is authorised. No approval, credential or target account comes across from the template.
      </Notice>
      <Properties rows={[
        { label: "Steps", value: String((body?.steps ?? []).length) },
        { label: "Team preset", value: String((body?.team ?? []).length) },
        { label: "Tool grants requested", value: (body?.grants ?? []).join(", ") || "None" },
        { label: "Target account", value: "Not carried — you choose one" },
      ]} />
      <ModalActions><OverlayActions primary={<Button
        variant="primary"
        onClick={() => {
          useMissionWizard.getState().set({
            ...EMPTY_MISSION,
            goal: template.summary,
            steps: (body?.steps ?? []).map((step) => ({ title: step.title, kind: step.kind as "read" })),
            agentIds: body?.team ?? [],
            grants: (body?.grants ?? []).filter((grant) => grant.startsWith("workspace.")),
            templateId: template.id,
          });
          context.toast("Draft started", "The wizard is filled with the template's shape. The target and ceiling are yours to set.");
          close();
          context.navigate(`/o/${context.org.slug}/mission/missions/new`);
        }}
      >
        Create a mission from this template
      </Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

/* ====================================================================== *
 * Module
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

async function missionRecord(context: ScreenContext, id: string | undefined): Promise<Rec | undefined> {
  const { db } = await import("@/runtime/db");
  if (id) {
    const found = await db.records.get(id);
    if (found?.collection === "missions") return found;
  }
  const rows = await db.records.where("[organizationId+collection]").equals([context.org.id, "missions"]).toArray();
  return rows[0];
}

async function duplicatePlan(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const mission = await missionRecord(context, context.selectedId);
  if (!mission) return;
  const tasks = (await db.records.where("parentId").equals(mission.id).toArray()).filter((row) => row.collection === "missionTasks");
  const copy = await context.mutate.create({
    collection: "missions",
    title: `${mission.title} (copy)`,
    status: "proposed",
    summary: mission.summary,
    amountMinor: mission.amountMinor,
    fields: { ...mission.fields, committedMinor: 0, spentMinor: 0, planVersion: 1, duplicatedFrom: mission.id },
    body: mission.body,
  }, `${mission.title} duplicated as a proposed mission`);
  for (const task of tasks) {
    await context.mutate.create({
      collection: "missionTasks",
      title: task.title,
      status: "todo",
      parentId: copy.id,
      summary: task.summary,
      fields: { ...task.fields, stage: "todo", reviewedBy: "", reviewNote: "" },
      body: { dependsOn: [], evidence: [] },
    }, "Task copied into the duplicated plan");
  }
  context.toast("Plan duplicated", `${copy.title} is proposed with ${tasks.length} tasks. No approval, evidence or spend was carried over.`);
}

async function approveNextStep(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return;
  const steps = (await db.records.where("parentId").equals(mission.id).toArray())
    .filter((row) => row.collection === "missionSteps" && row.status === "awaiting_approval")
    .sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0));
  const gate = steps[0];
  if (!gate) { context.toast("No gate is waiting", "Nothing on this mission is held for approval.", "info"); return; }
  if (!(await context.mutate.patch(gate.id, { status: "done", fields: { ...gate.fields, approvedBy: context.actor, approvedAt: context.now.toISOString() } }, { expectRevision: gate.revision, event: `${gate.title} approved by ${context.actor}` }))) return;
  context.toast("Gate passed", `${gate.title} was approved by ${context.actor}. The next step can be run from the console.`);
}

async function runNextStep(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return;
  if (mission.status === "paused" || mission.fields.executionPaused === true) {
    context.toast("Mission is stopped", `${mission.title} is stopped. Resume it before running the next step.`, "blocked");
    return;
  }
  if (["cancelled", "completed"].includes(mission.status)) {
    context.toast("Mission has ended", `${mission.title} is ${mission.status}. No further step will run.`, "blocked");
    return;
  }
  const children = await db.records.where("parentId").equals(mission.id).toArray();
  const steps = children.filter((row) => row.collection === "missionSteps").sort((a, b) => Number(a.fields.order ?? 0) - Number(b.fields.order ?? 0));
  const next = steps.find((step) => ["ready", "todo"].includes(step.status));
  if (!next) { context.toast("Nothing is ready", "Every step has run, is held at a gate or is stopped with a receipt.", "info"); return; }
  const pool = await db.records.where("organizationId").equals(context.org.id).toArray();
  await executeStep(context, next, mission, pool, context.money, context.date, context.now);
}

async function stopMission(context: ScreenContext): Promise<void> {
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return;
  if (!(await context.mutate.patch(mission.id, {
    status: mission.status === "paused" ? "running" : "paused",
    fields: { ...mission.fields, executionPaused: mission.status !== "paused", pausedBy: context.actor },
  }, { expectRevision: mission.revision, event: `${mission.title} ${mission.status === "paused" ? "resumed" : "stopped"} by ${context.actor}` }))) return;
  context.toast(mission.status === "paused" ? "Resumed" : "Stopped", mission.status === "paused" ? "The next step can be run again." : "No further step will be started until it is resumed.");
}

/** Resume only resumes: a running mission is never paused by pressing Resume. */
async function resumeMission(context: ScreenContext): Promise<void> {
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return;
  if (mission.status !== "paused") {
    context.toast("Nothing to resume", `${mission.title} is ${mission.status.replace(/_/g, " ")}, not paused.`, "blocked");
    return;
  }
  if (!(await context.mutate.patch(mission.id, {
    status: "running",
    fields: { ...mission.fields, executionPaused: false, resumedBy: context.actor },
  }, { expectRevision: mission.revision, event: `${mission.title} resumed by ${context.actor}` }))) return;
  context.toast("Resumed", "The next step can be run again.");
}

/** Cancelling is terminal and recorded; completed work and receipts are kept. */
async function cancelMission(context: ScreenContext): Promise<boolean> {
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return false;
  if (mission.status === "cancelled" || mission.status === "completed") {
    context.toast("Cannot cancel", `${mission.title} is already ${mission.status}.`, "blocked");
    return false;
  }
  if (!(await context.mutate.patch(mission.id, {
    status: "cancelled",
    fields: { ...mission.fields, executionPaused: true, cancelledBy: context.actor },
  }, { expectRevision: mission.revision, event: `${mission.title} cancelled by ${context.actor}` }))) return false;
  context.toast("Mission cancelled", "No further step will start. Completed steps and their receipts are kept.");
  return true;
}

function CancelMission({ context, close }: { context: ScreenContext; close: () => void }) {
  return (
    <Stack gap={4}>
      <p>Cancelling stops this mission for good. No further step will start, and it cannot be resumed.</p>
      <Notice tone="info">Steps that already finished keep their outputs and receipts, so the record of what happened is not lost.</Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Keep the mission</Button>
        <span className="ds-grow" />
        <Button variant="danger" onClick={async () => { if (await cancelMission(context)) close(); }}>Cancel the mission</Button>
      </Row>
    </Stack>
  );
}

export const missionApp = registerApp({
  code: "MISSION",
  short: "Missions",
  name: "Missions & Autonomous Execution",
  purpose: "Plans that run locally and stop honestly at every boundary",
  icon: Rocket,
  nav: [
    { items: [
      { label: "Mission library", screenId: "ARL-MISSION-001", icon: Rocket },
      { label: "New mission", screenId: "ARL-MISSION-002", icon: Target },
      { label: "Templates", screenId: "ARL-MISSION-011", icon: LayoutTemplate },
    ] },
    { label: "This mission", items: [
      { label: "Overview", screenId: "ARL-MISSION-003", icon: Target },
      { label: "Plan", screenId: "ARL-MISSION-004", icon: GitBranch },
      { label: "Task board", screenId: "ARL-MISSION-005", icon: Boxes },
      { label: "Execution console", screenId: "ARL-MISSION-006", icon: Play },
      { label: "Team room", screenId: "ARL-MISSION-007", icon: ClipboardCheck },
    ] },
    { label: "Outcome", items: [
      { label: "Deliverables", screenId: "ARL-MISSION-008", icon: FileText },
      { label: "Budget", screenId: "ARL-MISSION-009", icon: Wallet },
      { label: "Results", screenId: "ARL-MISSION-010", icon: Receipt },
    ] },
  ],
  screens: {
    "ARL-MISSION-001": {
      id: "ARL-MISSION-001",
      title: () => "Mission library",
      subtitle: (context) => `Every mission in ${context.org.name}, with what it has committed and what is blocking it.`,
      tabs: ["All", "Proposed", "Running", "Waiting", "Completed", "Archived"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionLibrary context={context} view={view} />,
      })),
      actions: [
        { id: "Create mission", placement: "primary", run: (context) => context.openOverlay("create mission") },
        { id: "open", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a mission first"), run: (context) => context.navigate(`/o/${context.org.slug}/mission/missions/${context.selectedId}`) },
        { id: "filter", placement: "secondary", run: () => { document.querySelector<HTMLInputElement>('input[aria-label^="Filter"]')?.focus(); } },
        { id: "duplicate plan", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a mission first"), run: (context) => void duplicatePlan(context) },
        { id: "bulk tag", placement: "overflow", run: (context) => context.openOverlay("bulk tag") },
      ],
      overlays: [
        { id: "Mission quick view", kind: "drawer", title: "Mission", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <MissionQuickView context={context} />, summary: (context) => <MissionSummary context={context} /> },
        { id: "create mission", kind: "modal", title: "Create a mission", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <CreateMissionOverlay context={context} /> },
        { id: "archive confirmation", kind: "modal", title: "Archive this mission", tone: "danger", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <MissionArchive context={context} close={close} />, summary: (context) => <MissionSummary context={context} /> },
        { id: "bulk tag", kind: "modal", title: "Tag missions", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <BulkTagMissions context={context} close={close} /> },
      ],
    },

    "ARL-MISSION-002": {
      id: "ARL-MISSION-002",
      title: () => "New mission",
      subtitle: () => "Six steps. A mission cannot be proposed without one named target, a bounded ceiling and a plan of typed steps.",
      tabs: WIZARD_STEPS.map((step) => ({
        id: step,
        render: (context: ScreenContext) => <MissionCreation context={context} step={step} />,
      })),
      actions: [
        { id: "submit for approval", placement: "primary", guard: () => {
          const draft = useMissionWizard.getState().draft;
          const problems = WIZARD_STEPS.flatMap((step) => wizardProblems(draft, step));
          return problems.length === 0 ? undefined : `${problems.length} thing${problems.length === 1 ? "" : "s"} outstanding: ${problems[0]}`;
        }, run: (context) => context.openOverlay("approval sheet") },
        { id: "Describe goal", placement: "secondary", run: (context) => context.openOverlay("describe goal") },
        { id: "attach records", placement: "secondary", run: (context) => context.openOverlay("attach records") },
        { id: "revise plan", placement: "overflow", run: (context) => context.openOverlay("revise plan") },
      ],
      overlays: [
        { id: "Source picker", kind: "drawer", title: "Context records", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <SourcePicker context={context} /> },
        { id: "team selector", kind: "drawer", title: "Who can do what", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <TeamSelector context={context} /> },
        { id: "risk review", kind: "modal", title: "Risk review", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <RiskReview context={context} /> },
        { id: "approval sheet", kind: "modal", title: "Submit for approval", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ApprovalSheet context={context} close={close} /> },
        { id: "describe goal", kind: "modal", title: "Describe the goal", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <DescribeGoal context={context} close={close} /> },
        { id: "attach records", kind: "modal", title: "Attach records", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <AttachMissionRecords context={context} close={close} /> },
        { id: "revise plan", kind: "modal", title: "Revise the plan", width: OVERLAY_WIDTH.record, render: ({ close, ...context }) => <RevisePlan context={context} close={close} /> },
      ],
    },

    "ARL-MISSION-003": {
      id: "ARL-MISSION-003",
      title: () => "Mission overview",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["Overview", "Plan", "Team", "Deliverables", "Activity", "Results"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionOverview context={context} view={view} />,
      })),
      actions: [
        { id: "approve next step", placement: "primary", capability: "approve_mission", run: (context) => void approveNextStep(context) },
        { id: "ask status", placement: "secondary", run: (context) => context.openOverlay("Status explanation") },
        { id: "Pause", placement: "secondary", run: (context) => context.openOverlay("pause dialog") },
        { id: "resume", label: "Resume", placement: "overflow", run: (context) => void resumeMission(context) },
        { id: "cancel", label: "Cancel the mission", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("cancel mission") },
      ],
      overlays: [
        { id: "Status explanation", kind: "drawer", title: "How this status is computed", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <StatusExplanation context={context} />, summary: (context) => <MissionSummary context={context} /> },
        { id: "pause dialog", kind: "modal", title: "Pause execution", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <PauseDialog context={context} close={close} />, summary: (context) => <MissionSummary context={context} /> },
        { id: "amendment request", kind: "modal", title: "Request an amendment", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <AmendmentRequest context={context} close={close} />, footer: submitFooter("amendment", "Record the request") },
        { id: "cancel mission", kind: "modal", title: "Cancel this mission?", tone: "danger", width: OVERLAY_WIDTH.compact, render: ({ close, ...context }) => <CancelMission context={context} close={close} /> },
      ],
    },

    "ARL-MISSION-004": {
      id: "ARL-MISSION-004",
      title: () => "Plan and dependencies",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["Graph", "List", "Timeline", "Risks"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <PlanDependencies context={context} view={view} />,
      })),
      actions: [
        { id: "Drag dependencies", label: "Edit dependencies", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a task in the graph or the list"), run: (context) => context.openOverlay("Task inspector") },
        { id: "edit task", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a task first"), run: (context) => context.openOverlay("Task inspector") },
        { id: "add review", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a task first"), run: (context) => context.openOverlay("scope change approval") },
        { id: "compare versions", placement: "overflow", run: (context) => context.openOverlay("plan revision") },
      ],
      overlays: [
        { id: "Task inspector", kind: "drawer", title: "Task", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <TaskInspector context={context} close={close} />, summary: (context) => <TaskSummary context={context} /> },
        { id: "plan revision", kind: "modal", title: "Revise the plan", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <PlanRevision context={context} close={close} /> },
        { id: "scope change approval", kind: "modal", title: "Scope change", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ScopeChangeApproval context={context} /> },
      ],
    },

    "ARL-MISSION-005": {
      id: "ARL-MISSION-005",
      title: () => "Task board",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["Board", "List", "Assignees"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <TaskBoard context={context} view={view} />,
      })),
      actions: [
        { id: "Move card", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a card first"), run: (context) => context.openOverlay("move impact") },
        { id: "delegate", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a card first"), run: (context) => context.openOverlay("reassign") },
        { id: "attach evidence", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a card first"), run: (context) => context.openOverlay("Task detail") },
        { id: "reopen task", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a card first"), run: (context) => void reopenTask(context) },
      ],
      overlays: [
        { id: "Task detail", kind: "drawer", title: "Task", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <TaskDetail context={context} />, summary: (context) => <TaskSummary context={context} /> },
        { id: "reassign", kind: "modal", title: "Reassign", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <ReassignTask context={context} close={close} />, summary: (context) => <TaskSummary context={context} /> },
        { id: "move impact", kind: "modal", title: "What a move changes", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <MoveImpact context={context} />, summary: (context) => <TaskSummary context={context} /> },
      ],
    },

    "ARL-MISSION-006": {
      id: "ARL-MISSION-006",
      title: () => "Execution console",
      subtitle: (context) => <MissionLine context={context} />,
      statusStrip: () => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>Providers: none connected</Pill>
          <Pill tone="neutral">Every run writes a receipt</Pill>
        </Row>
      ),
      tabs: ["Timeline", "Actions", "Checkpoints", "Exceptions"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ExecutionConsole context={context} view={view} />,
      })),
      actions: [
        { id: "continue", label: "Run the next step", placement: "primary", run: (context) => void runNextStep(context) },
        { id: "Inspect receipt", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a step first"), run: (context) => context.openOverlay("Action receipt") },
        { id: "retry safe task", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a step first"), run: (context) => context.openOverlay("retry confirmation") },
        { id: "stop", placement: "overflow", tone: "danger", run: (context) => void stopMission(context) },
      ],
      overlays: [
        { id: "Action receipt", kind: "drawer", title: "Receipts", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ActionReceipt context={context} /> },
        { id: "retry confirmation", kind: "modal", title: "Retry this step", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <RetryConfirmation context={context} close={close} /> },
        { id: "execution trace", kind: "drawer", title: "Trace", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ExecutionTrace context={context} /> },
      ],
    },

    "ARL-MISSION-007": {
      id: "ARL-MISSION-007",
      title: () => "Mission team room",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["Discussion", "Owners", "Decisions", "Reviews"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionTeamRoom context={context} view={view} />,
      })),
      actions: [
        { id: "Message", placement: "primary", run: (context) => context.openOverlay("post message") },
        { id: "mention", placement: "secondary", run: (context) => context.openOverlay("Agent selector") },
        { id: "request review", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a task on the Reviews tab"), run: (context) => context.openOverlay("handoff view") },
        { id: "accept handoff", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a task first"), run: (context) => void acceptHandoff(context) },
      ],
      overlays: [
        { id: "Agent selector", kind: "drawer", title: "AI employees on this mission", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <AgentSelectorOverlay context={context} /> },
        { id: "handoff view", kind: "modal", title: "Request a review", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <HandoffView context={context} close={close} /> },
        { id: "decision record", kind: "modal", title: "Record a decision", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <MissionDecisionRecord context={context} close={close} />, footer: submitFooter("mission-decision", "Record decision") },
        { id: "post message", kind: "modal", title: "Message the room", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <PostMissionMessage context={context} close={close} /> },
      ],
    },

    "ARL-MISSION-008": {
      id: "ARL-MISSION-008",
      title: () => "Deliverables",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["All", "Draft", "Review", "Approved", "Published"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <Deliverables context={context} view={view} />,
      })),
      actions: [
        { id: "Open edit", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a deliverable first"), run: (context) => context.openOverlay("Artifact preview") },
        { id: "approve", placement: "secondary", capability: "approve_mission", guard: (context) => (context.selectedId ? undefined : "Choose a deliverable first"), run: (context) => context.openOverlay("approval") },
        { id: "compare", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a deliverable first"), run: (context) => context.openOverlay("version diff") },
        { id: "export", placement: "overflow", capability: "export_data", guard: (context) => (context.selectedId ? undefined : "Choose a deliverable first"), run: (context) => void exportDeliverable(context) },
        { id: "share", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a deliverable first"), run: (context) => context.openOverlay("publish verification") },
      ],
      overlays: [
        { id: "Artifact preview", kind: "drawer", title: "Deliverable", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <ArtifactPreviewOverlay context={context} />, summary: (context) => <DeliverableSummary context={context} /> },
        { id: "approval", kind: "modal", title: "Approve the deliverable", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <DeliverableApproval context={context} close={close} />, summary: (context) => <DeliverableSummary context={context} /> },
        { id: "version diff", kind: "modal", title: "Versions", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <VersionDiff context={context} />, summary: (context) => <DeliverableSummary context={context} /> },
        { id: "publish verification", kind: "modal", title: "Publishing outside this workspace", tone: "danger", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <PublishVerification context={context} />, summary: (context) => <DeliverableSummary context={context} /> },
      ],
    },

    "ARL-MISSION-009": {
      id: "ARL-MISSION-009",
      title: () => "Mission budget",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["Summary", "Ledger", "Policies", "History"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionBudget context={context} view={view} />,
      })),
      actions: [
        { id: "Approve adjustment", placement: "primary", capability: "approve_payment", run: (context) => context.openOverlay("limit increase approval") },
        { id: "inspect cost", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a ledger entry first"), run: (context) => context.openOverlay("cost source") },
        { id: "set alert", placement: "secondary", run: (context) => context.openOverlay("set alert") },
        { id: "variance", label: "Variance", placement: "overflow", run: (context) => context.openOverlay("Budget variance") },
        { id: "export", placement: "overflow", capability: "export_data", run: (context) => void exportBudget(context) },
      ],
      overlays: [
        { id: "Budget variance", kind: "drawer", title: "Variance", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <BudgetVariance context={context} /> },
        { id: "limit increase approval", kind: "modal", title: "Raise the ceiling", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <LimitIncrease context={context} close={close} /> },
        { id: "cost source", kind: "drawer", title: "Where this cost came from", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <CostSource context={context} /> },
        { id: "set alert", kind: "modal", title: "Set a budget alert", width: OVERLAY_WIDTH.form, render: ({ close, ...context }) => <SetBudgetAlert context={context} close={close} /> },
      ],
    },

    "ARL-MISSION-010": {
      id: "ARL-MISSION-010",
      title: () => "Mission results",
      subtitle: (context) => <MissionLine context={context} />,
      tabs: ["Outcomes", "Evidence", "ROI", "Follow-up"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionResults context={context} view={view} />,
      })),
      actions: [
        { id: "close mission", placement: "primary", capability: "approve_mission", run: (context) => context.openOverlay("results approval") },
        { id: "View evidence", placement: "secondary", run: (context) => context.setTab("Evidence") },
        { id: "create follow-up", placement: "secondary", run: (context) => context.openOverlay("reopen") },
        { id: "issue report", placement: "overflow", capability: "export_data", run: (context) => void exportResults(context) },
      ],
      overlays: [
        { id: "Source inspector", kind: "drawer", title: "Evidence", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ActionReceipt context={context} /> },
        { id: "results approval", kind: "modal", title: "Close the mission", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ResultsApproval context={context} close={close} /> },
        { id: "reopen", kind: "modal", title: "Create a follow-up", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ReopenTask context={context} close={close} /> },
      ],
    },

    "ARL-MISSION-011": {
      id: "ARL-MISSION-011",
      title: () => "Mission templates",
      subtitle: () => "A template carries steps, a team preset and tool grants. It never carries an account, a credential or an approval.",
      tabs: ["Company", "Industry", "My templates"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <MissionTemplates context={context} view={view} />,
      })),
      actions: [
        { id: "Create from", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => context.openOverlay("approval grant") },
        { id: "edit template", placement: "secondary", run: (context) => context.openOverlay("Template editor") },
        { id: "simulate", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => context.openOverlay("example data") },
        { id: "publish", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => void publishTemplate(context) },
      ],
      overlays: [
        { id: "Template editor", kind: "modal", title: "Template", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <TemplateEditor context={context} close={close} />, footer: submitFooter("template-editor", "Save template") },
        { id: "example data", kind: "drawer", title: "What would happen", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ExampleData context={context} /> },
        { id: "approval grant", kind: "modal", title: "Create a mission from this template", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <ApprovalGrant context={context} close={close} /> },
      ],
    },
  },
});

async function reopenTask(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const task = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!task || task.collection !== "missionTasks") { context.toast("Choose a card", "Select the task to reopen.", "info"); return; }
  if (!(await context.mutate.patch(task.id, { status: "ready", fields: { ...task.fields, stage: "ready", reopenedBy: context.actor, reviewedBy: "" } }, { expectRevision: task.revision, event: `${task.title} reopened by ${context.actor}` }))) return;
  context.toast("Reopened", `${task.title} is back in Ready, and its review is cleared so it must be verified again.`);
}

async function acceptHandoff(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const task = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!task || task.collection !== "missionTasks") { context.toast("Choose a task", "Select the handoff to accept.", "info"); return; }
  if (!(await context.mutate.patch(task.id, { ownerName: context.actor, fields: { ...task.fields, assignee: context.actor, kind: "human", acceptedBy: context.actor } }, { expectRevision: task.revision, event: `${task.title} accepted by ${context.actor}` }))) return;
  context.toast("Handoff accepted", `${task.title} is yours. The deliverable and its bound are unchanged.`);
}

function download(context: ScreenContext, filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  context.toast("Exported", "The file was written by this browser. Nothing was uploaded.");
}

async function exportDeliverable(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const item = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!item) return;
  const body = (item.body ?? {}) as { text?: string };
  download(context, `${item.title.replace(/\s+/g, "-").toLowerCase()}.txt`, [item.title, `Status: ${item.status}`, "", body.text ?? item.summary].join("\n"));
}

async function exportBudget(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return;
  const costs = (await db.records.where("parentId").equals(mission.id).toArray()).filter((row) => row.collection === "missionCosts");
  const lines = ["kind,entry,amount,approved_by,when", ...costs.map((cost) => [String(cost.fields.kind), cost.title, String((cost.amountMinor ?? 0) / 100), String(cost.fields.approvedBy ?? ""), cost.at ?? cost.updatedAt].map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))];
  download(context, `${mission.title.replace(/\s+/g, "-").toLowerCase()}-budget.csv`, lines.join("\n"));
}

async function exportResults(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const mission = await missionRecord(context, context.params.id);
  if (!mission) return;
  const children = await db.records.where("parentId").equals(mission.id).toArray();
  const receipts = children.filter((row) => row.collection === "missionReceipts");
  const criteria = criteriaOf(mission);
  download(context, `${mission.title.replace(/\s+/g, "-").toLowerCase()}-results.txt`, [
    mission.title,
    `Status: ${mission.status}`,
    "",
    "Criteria:",
    ...criteria.map((criterion) => `${criterion.verified ? "[verified]" : "[open]"} ${criterion.label}${criterion.evidenceId ? ` — evidence ${criterion.evidenceId}` : " — no evidence"}`),
    "",
    "Receipts:",
    ...receipts.map((receipt) => `${receipt.at} ${receipt.title}: ${String(receipt.fields.state)} — ${receipt.summary}`),
    "",
    "No return-on-investment figure is included: no provider cost was incurred and no outcome has been measured in money.",
  ].join("\n"));
}

async function publishTemplate(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const template = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!template || template.collection !== "templates") return;
  if (!(await context.mutate.patch(template.id, { status: "published", fields: { ...template.fields, publishedBy: context.actor } }, { expectRevision: template.revision, event: `${template.title} published by ${context.actor}` }))) return;
  context.toast("Published", "It is offered to anyone creating a mission here. No credential or approval travels with it.");
}

/* ====================================================================== *
 * Contract actions that perform the operation they name.
 * ====================================================================== */

/** MISSION-001: tags the chosen missions. */
/** Tags each mission against the revision it was read at; returns how many were saved (a stale one returns null and is not counted). */
export async function tagMissions(context: Pick<ScreenContext, "mutate">, missions: Rec[], tag: string): Promise<number> {
  let tagged = 0;
  for (const mission of missions) {
    const saved = await context.mutate.patch(mission.id, { tags: [...new Set([...mission.tags, tag])] }, { expectRevision: mission.revision, event: `${mission.title} tagged ${tag}` });
    if (saved) tagged += 1;
  }
  return tagged;
}

function BulkTagMissions({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMissionData();
  const missions = data.missions.filter((mission) => mission.status !== "archived");
  const [chosen, setChosen] = useState<string[]>(context.selectedId ? [context.selectedId] : []);
  const [tag, setTag] = useState("priority");
  const [busy, setBusy] = useState(false);
  return (
    <Stack gap={4}>
      <Field label="Tag" required><TextInput aria-label="Tag" value={tag} onChange={(event) => setTag(event.target.value)} /></Field>
      <Stack gap={2}>
        {missions.map((mission) => (
          <Checkbox key={mission.id} label={`${mission.title} · ${mission.status}${mission.tags.length ? ` · ${mission.tags.join(", ")}` : ""}`} checked={chosen.includes(mission.id)}
            onChange={(event) => setChosen((list) => (event.target.checked ? [...list, mission.id] : list.filter((id) => id !== mission.id)))} />
        ))}
      </Stack>
      <ModalActions><OverlayActions primary={<Button variant="primary" busy={busy} disabled={chosen.length === 0 || !tag.trim()} onClick={async () => {
          setBusy(true);
          try {
            const tagged = await tagMissions(context, missions.filter((item) => chosen.includes(item.id)), tag.trim());
            if (tagged === 0) return;
            context.toast(tagged === chosen.length ? "Tagged" : "Partly tagged", `${tagged} of ${chosen.length} mission${chosen.length === 1 ? "" : "s"} tagged ${tag.trim()}.${tagged < chosen.length ? " The rest changed elsewhere; reopen and try again." : ""}`, tagged === chosen.length ? "ok" : "blocked");
            close();
          } finally { setBusy(false); }
        }}>Tag {chosen.length}</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

/** MISSION-002: writes the goal and the success criteria into the draft. */
function DescribeGoal({ context, close }: { context: ScreenContext; close: () => void }) {
  const draft = useMissionWizard((state) => state.draft);
  const set = useMissionWizard((state) => state.set);
  const [goal, setGoal] = useState(draft.goal);
  const [criteria, setCriteria] = useState(draft.successCriteria);
  const problems = wizardProblems({ ...draft, goal, successCriteria: criteria }, "Goal");
  return (
    <Stack gap={4}>
      <Field label="What the mission must achieve" required><TextArea aria-label="What the mission must achieve" value={goal} rows={3} onChange={(event) => setGoal(event.target.value)} /></Field>
      <Field label="Success criteria" required hint="Completion is verified against these, not against an agent saying it is done."><TextArea aria-label="Success criteria" value={criteria} rows={3} onChange={(event) => setCriteria(event.target.value)} /></Field>
      {problems.length > 0 && <Notice tone="warning" title="Not complete yet">{problems.join(" ")}</Notice>}
      <ModalActions><OverlayActions primary={<Button variant="primary" disabled={problems.length > 0} onClick={() => { set({ goal: goal.trim(), successCriteria: criteria.trim() }); context.toast("Goal recorded", "The draft holds the goal and its criteria. Nothing is written until you submit."); close(); }}>Save the goal</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

/** MISSION-002: attaches the records the mission is about to the draft. */
function AttachMissionRecords({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useMissionData();
  const draft = useMissionWizard((state) => state.draft);
  const set = useMissionWizard((state) => state.set);
  const [chosen, setChosen] = useState<string[]>(draft.contextIds);
  const pool = [...data.contacts, ...data.companies, ...data.suppliers, ...data.documents, ...data.objectives].slice(0, 60);
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Attached records are the mission's scope">An AI employee on the mission reads these within its grants. Nothing else is in scope.</Notice>
      <Stack gap={1} style={{ maxHeight: "48vh", overflowY: "auto" }}>
        {pool.map((record) => (
          <Checkbox key={record.id} label={`${record.title} · ${record.collection}`} checked={chosen.includes(record.id)}
            onChange={(event) => setChosen((list) => (event.target.checked ? [...list, record.id] : list.filter((id) => id !== record.id)))} />
        ))}
      </Stack>
      <ModalActions><OverlayActions primary={<Button variant="primary" onClick={() => { set({ contextIds: chosen }); context.toast("Records attached", `${chosen.length} record${chosen.length === 1 ? " is" : "s are"} in the mission's scope.`); close(); }}>Attach {chosen.length}</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

const STEP_KINDS = ["read", "compute", "draft", "approval", "provider"] as const;

/** MISSION-002: edits the typed steps of the draft plan. */
function RevisePlan({ context, close }: { context: ScreenContext; close: () => void }) {
  const draft = useMissionWizard((state) => state.draft);
  const set = useMissionWizard((state) => state.set);
  const [steps, setSteps] = useState(draft.steps);
  const providerWithoutApproval = steps.some((step, index) => step.kind === "provider" && !steps.slice(0, index).some((item) => item.kind === "approval"));
  return (
    <Stack gap={4}>
      {steps.map((step, index) => (
        <Row key={`${index}-${step.kind}`} gap={2} wrap>
          <TextInput aria-label={`Step ${index + 1}`} value={step.title} onChange={(event) => setSteps(steps.map((item, at) => (at === index ? { ...item, title: event.target.value } : item)))} style={{ flex: "1 1 220px" }} />
          <Select aria-label={`Kind of step ${index + 1}`} value={step.kind} onChange={(event) => setSteps(steps.map((item, at) => (at === index ? { ...item, kind: event.target.value as typeof item.kind } : item)))} style={{ width: "auto" }}>
            {STEP_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </Select>
          <Button size="sm" variant="ghost" aria-label={`Remove step ${index + 1}`} onClick={() => setSteps(steps.filter((_, at) => at !== index))}>Remove</Button>
        </Row>
      ))}
      <Button variant="secondary" onClick={() => setSteps([...steps, { title: "", kind: "read" }])}>Add a step</Button>
      {providerWithoutApproval && <Notice tone="warning" title="A provider step has no approval before it">A step that would reach outside the workspace should follow an approval step. It will stop at the provider boundary either way.</Notice>}
      <ModalActions><OverlayActions primary={<Button variant="primary" disabled={steps.length === 0 || steps.some((step) => !step.title.trim())} onClick={() => { set({ steps: steps.map((step) => ({ ...step, title: step.title.trim() })) }); context.toast("Plan revised", `${steps.length} step${steps.length === 1 ? "" : "s"} in the draft plan.`); close(); }}>Save the plan</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

/** MISSION-007: posts a message in the mission room. */
function PostMissionMessage({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission } = useMission(context);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  if (!mission) return <Empty title="No mission" />;
  return (
    <Stack gap={4}>
      <Field label={`Message to the ${mission.title} room`} required><TextArea aria-label="Message" value={text} rows={4} onChange={(event) => setText(event.target.value)} /></Field>
      <Notice tone="info" title="A message starts nothing">It is recorded in the room with your name. No AI employee acts on it without a task and its grants.</Notice>
      <ModalActions><OverlayActions primary={<Button variant="primary" busy={busy} disabled={!text.trim()} onClick={async () => {
          setBusy(true);
          await context.mutate.create({
            collection: "messages", title: text.trim().slice(0, 60), status: "posted", summary: text.trim(), parentId: mission.id,
            at: clockIso(), fields: { author: context.actor, kind: "human", room: "mission" },
          }, `Message posted in the ${mission.title} room`);
          context.toast("Posted", "The message is in the Discussion tab.");
          context.setTab("Discussion");
          setBusy(false);
          close();
        }}>Post the message</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}

/** MISSION-009: sets the spend alert threshold on the mission budget. */
function SetBudgetAlert({ context, close }: { context: ScreenContext; close: () => void }) {
  const { mission, costs } = useMission(context);
  const [percentPicked, setPercent] = useState<string>();
  const percent = percentPicked ?? (String(mission?.fields.alertAtPercent ?? 80));
  const [busy, setBusy] = useState(false);
  if (!mission) return <Empty title="No mission" />;
  const ceiling = Number(mission.fields.budgetMinor ?? 0);
  const used = costs.reduce((sum, cost) => sum + (cost.amountMinor ?? 0), 0);
  const value = Math.max(1, Math.min(100, Number(percent) || 0));
  const crossed = ceiling > 0 && used >= Math.round((ceiling * value) / 100);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Ceiling", value: context.money(ceiling) },
        { label: "Committed and spent", value: context.money(used) },
      ]} />
      <Field label="Alert when usage reaches, %" hint={`That is ${context.money(Math.round((ceiling * value) / 100))}.`}>
        <TextInput aria-label="Alert when usage reaches" type="number" min={1} max={100} value={percent} onChange={(event) => setPercent(event.target.value)} />
      </Field>
      {crossed && <Notice tone="warning" title="Already past this threshold">The alert raises in the inbox as soon as it is saved.</Notice>}
      <ModalActions><OverlayActions primary={<Button variant="primary" busy={busy} disabled={ceiling <= 0} onClick={async () => {
          setBusy(true);
          const saved = await context.mutate.patch(mission.id, { fields: { ...mission.fields, alertAtPercent: value, alertSetBy: context.actor } }, { expectRevision: mission.revision, event: `Budget alert on ${mission.title} set at ${value}% by ${context.actor}` });
          if (saved && crossed) {
            await context.mutate.create({ collection: "notifications", title: `${mission.title} is past ${value}% of its ceiling`, status: "unread", summary: `${context.money(used)} of ${context.money(ceiling)} is committed or spent.`, fields: { kind: "budget", missionId: mission.id, priority: "P1" } }, `Budget alert raised for ${mission.title}`);
          }
          if (saved) context.toast("Alert set", `An alert raises at ${value}% of the ceiling.`);
          setBusy(false);
          close();
        }}>Save the alert</Button>} end={<OverlayCancel>Cancel</OverlayCancel>} /></ModalActions>
    </Stack>
  );
}
