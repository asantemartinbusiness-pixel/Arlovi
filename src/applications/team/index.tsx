import { useMemo, useState } from "react";
import {
  Bot, Cpu, FlaskConical, Gauge, GraduationCap, Network, Users, Wrench,
} from "lucide-react";
import {
  Avatar, BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Meter, Notice, Pill,
  Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useCollection, useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { CapabilityLine, DiagramToggle } from "@/applications/t2_shared/pieces";
import { useAgentBuilder } from "@/applications/t2_shared/store";
import { SAFETY_SCORE, activationBlockers, assertionsOf, latestRunFor, runScenario, type RunResult } from "./evaluator";
import type { Rec } from "@/domain/types";

/* ====================================================================== *
 * TEAM — AI Workforce & Agent Academy
 *
 * An AI employee here is a contract: what it may read, which tools it holds,
 * who manages it, what it may spend and how it scored when it was evaluated.
 * No model provider is connected, so no contract has produced generated text
 * and recorded provider cost is zero rather than estimated.
 * ====================================================================== */

interface AgentBody {
  skills?: string[];
  tools?: { id: string; label: string; granted: boolean; capability?: string }[];
  authority?: string[];
  sources?: string[];
}

function agentBody(agent: Rec | undefined): AgentBody {
  return (agent?.body ?? {}) as AgentBody;
}

function useWorkforce() {
  return useCollections(["agents", "skills", "evaluations", "members", "departments", "missionTasks", "missions", "connectors", "courses", "sources", "tasks"]);
}

/* ---------------------------- TEAM-001 ---------------------------- */

function WorkforceHome({ context, view }: { context: ScreenContext; view: "Overview" | "Activity" | "Costs" | "Reliability" }) {
  const data = useWorkforce();
  const runs = data.evaluations.filter((item) => item.fields.kind === "run");
  const active = data.agents.filter((agent) => agent.status === "active");
  const paused = data.agents.filter((agent) => agent.status === "paused");
  const draft = data.agents.filter((agent) => agent.status === "draft");
  const assigned = data.missionTasks.filter((task) => task.fields.kind === "ai" && !["verified", "done"].includes(String(task.fields.stage ?? task.status)));
  const reviewsDue = data.agents.filter((agent) => {
    const run = latestRunFor(data.evaluations, agent.id);
    return !run || Number(run.fields.score ?? 0) < SAFETY_SCORE;
  });

  if (view === "Activity") {
    const rows = [...data.missionTasks, ...data.tasks].filter((task) => data.agents.some((agent) => agent.title === String(task.fields.assignee ?? "")));
    return rows.length === 0 ? (
      <Empty title="No AI employee holds work right now" icon={<Bot size={20} />}>Work appears here when a mission plan or a task board assigns it to a contract.</Empty>
    ) : (
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="AI employee activity"
        columns={[
          { key: "title", header: "Work", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "who", header: "AI employee", cell: (row) => <Row gap={2}><Avatar name={String(row.fields.assignee)} kind="ai" size="sm" />{String(row.fields.assignee)}</Row> },
          { key: "stage", header: "Stage", cell: (row) => <Pill tone={row.fields.stage === "blocked" ? "warning" : row.fields.stage === "verified" ? "success" : "neutral"}>{String(row.fields.stage ?? row.status)}</Pill> },
          { key: "state", header: "Running?", cell: () => <Pill tone="warning">Idle — no model connected</Pill> },
        ]}
      />
    );
  }

  if (view === "Costs") {
    return (
      <Stack gap={4}>
        <CapabilityLine id="model.inference" title="No provider cost has been incurred" />
        <StatRow>
          <Stat label="Recorded provider cost" value={context.money(0)} prov="posted" meta="Nothing ran, so nothing was charged" />
          <Stat label="Spend ceilings set" value={context.money(data.agents.reduce((sum, agent) => sum + Number(agent.fields.spendCapMinor ?? 0), 0))} prov="human" meta={`Across ${data.agents.length} contracts`} />
          <Stat label="Cost per task" value="Unavailable" unavailable meta="No run has a provider cost to divide" />
          <Stat label="Forecast" value="Unavailable" unavailable meta="A forecast needs a connected provider's prices" />
        </StatRow>
        <DataGrid
          rows={data.agents}
          rowId={(row) => row.id}
          label="Contract budgets"
          columns={[
            { key: "title", header: "AI employee", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "role", header: "Role", cell: (row) => String(row.fields.role ?? "") },
            { key: "cap", header: "Spend ceiling", align: "end", cell: (row) => context.money(Number(row.fields.spendCapMinor ?? 0)), sortValue: (row) => Number(row.fields.spendCapMinor ?? 0) },
            { key: "spent", header: "Recorded cost", align: "end", cell: (row) => context.money(Number(row.fields.recordedCostMinor ?? 0)) },
            { key: "model", header: "Model", cell: () => <Pill tone="warning">Not connected</Pill> },
          ]}
          onOpen={(id) => context.openOverlay("cost inspector", { id })}
        />
      </Stack>
    );
  }

  if (view === "Reliability") {
    const scenarios = data.evaluations.filter((item) => item.fields.kind === "scenario");
    return (
      <Grid>
        <Card span={12} eyebrow="RELIABILITY" prov="posted" title="Evaluation scores by contract" subtitle="From recorded runs only">
          <BarChart
            title="Latest evaluation score"
            height={220}
            format={(value) => `${Math.round(value)}`}
            series={[{
              name: "Score",
              points: data.agents.map((agent) => ({ label: agent.title.split(" ")[0], value: Number(latestRunFor(data.evaluations, agent.id)?.fields.score ?? 0) })),
            }]}
            footer={`A contract with no recorded run shows zero because nothing has been measured, not because it scored zero. ${SAFETY_SCORE} is the activation line.`}
          />
        </Card>
        <Card span={6} title="Contracts below the safety line" subtitle={`${reviewsDue.length} of ${data.agents.length}`}>
          <Stack gap={2}>
            {reviewsDue.map((agent) => {
              const run = latestRunFor(data.evaluations, agent.id);
              return (
                <Row key={agent.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                  <Avatar name={agent.title} kind="ai" size="sm" />
                  <span className="ds-grow ds-truncate">{agent.title}</span>
                  <Pill tone="warning">{run ? `${String(run.fields.score)} / 100` : "Never evaluated"}</Pill>
                </Row>
              );
            })}
            {reviewsDue.length === 0 && <Notice tone="success">Every contract has a recorded run at or above the line.</Notice>}
          </Stack>
        </Card>
        <Card span={6} title="Scenarios" subtitle={`${scenarios.length} recorded`}>
          <Stack gap={2}>
            {scenarios.map((scenario) => (
              <Row key={scenario.id} gap={2}>
                <span className="ds-grow ds-truncate">{scenario.title}</span>
                <Pill tone={String(scenario.fields.severity) === "safety" ? "danger" : "neutral"}>{String(scenario.fields.severity ?? "quality")}</Pill>
                <span className="ds-subtle">{assertionsOf(scenario).length} checks</span>
              </Row>
            ))}
          </Stack>
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Active contracts" value={String(active.length)} prov="human" meta={`${paused.length} paused, ${draft.length} draft`} onClick={() => context.navigate(`/o/${context.org.slug}/team/agents`)} />
        <Stat label="Work assigned to them" value={String(assigned.length)} prov="posted" meta="Open items on mission plans" />
        <Stat label="Reviews due" value={String(reviewsDue.length)} prov="agent" meta={`Below the ${SAFETY_SCORE} safety line or never evaluated`} onClick={() => context.navigate(`/o/${context.org.slug}/team/evaluations`)} />
        <Stat label="Provider cost" value={context.money(0)} prov="posted" meta={`${runs.length} evaluation runs recorded, no provider charge`} />
      </StatRow>

      <Notice tone="warning" title="An AI employee here is a contract, not a running process">
        Nothing is executing in the background. A contract records what its role may do, which records it may read and what it may spend. Without a model provider it cannot generate text, and this workspace will not show it as busy or thinking.
      </Notice>

      <Grid>
        <Card span={7} eyebrow="AI WORKFORCE" prov="human" title="Roster" subtitle={`${data.agents.length} contracts`}>
          <Stack gap={2}>
            {data.agents.map((agent) => {
              const run = latestRunFor(data.evaluations, agent.id);
              return (
                <button key={agent.id} type="button" className="ds-record-card" onClick={() => { context.select(agent.id); context.openOverlay("quick profile", { id: agent.id }); }}>
                  <Row gap={2}>
                    <Avatar name={agent.title} kind="ai" size="sm" />
                    <strong className="ds-grow ds-truncate" style={{ textAlign: "start" }}>{agent.title}</strong>
                    <Pill tone={agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral"} dot>{agent.status}</Pill>
                    <Pill tone={run && Number(run.fields.score ?? 0) >= SAFETY_SCORE ? "success" : "warning"}>{run ? `${String(run.fields.score)}/100` : "Not evaluated"}</Pill>
                  </Row>
                  <span className="ds-subtle">{String(agent.fields.role ?? "")} · reports to {String(agent.fields.manager ?? "unassigned")}</span>
                </button>
              );
            })}
          </Stack>
        </Card>

        <Card span={5} eyebrow="BLOCKED" prov="unknown" title="Blocked contracts" subtitle={`${paused.length} paused`}>
          {paused.length === 0 ? <Empty title="Nothing is paused" icon={<Bot size={18} />} /> : (
            <Stack gap={3}>
              {paused.map((agent) => (
                <div key={agent.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: "3px solid var(--warning)" }}>
                  <strong>{agent.title}</strong>
                  <p className="ds-subtle">{String(agent.fields.pausedReason || "No reason recorded.")}</p>
                  <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents/${agent.id}`)}>Open the contract</Button>
                </div>
              ))}
            </Stack>
          )}
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- TEAM-002 ---------------------------- */

function AgentDirectory({ context, view }: { context: ScreenContext; view: "All" | "By department" | "Active" | "Paused" | "Draft" }) {
  const data = useWorkforce();
  const rows = view === "All" || view === "By department"
    ? data.agents
    : data.agents.filter((agent) => agent.status === view.toLowerCase());

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()} contract`} icon={<Bot size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents/new`)}>Build one</Button>} />;
  }

  if (view === "By department") {
    return (
      <Grid>
        {data.departments.map((department) => {
          const members = data.agents.filter((agent) => agent.fields.departmentId === department.id);
          return (
            <Card key={department.id} span={4} title={department.title} subtitle={`${members.length} AI employees`}>
              <Stack gap={2}>
                {members.map((agent) => (
                  <Row key={agent.id} gap={2}>
                    <Avatar name={agent.title} kind="ai" size="sm" />
                    <span className="ds-grow ds-truncate">{agent.title}</span>
                    <Pill tone={agent.status === "active" ? "success" : "warning"}>{agent.status}</Pill>
                  </Row>
                ))}
                {members.length === 0 && <span className="ds-subtle">No AI employee in this department.</span>}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  return (
    <Grid>
      {rows.map((agent) => {
        const body = agentBody(agent);
        const run = latestRunFor(data.evaluations, agent.id);
        const granted = (body.tools ?? []).filter((tool) => tool.granted);
        return (
          <Card
            key={agent.id}
            span={4}
            eyebrow="AI EMPLOYEE"
            prov="agent"
            machine={agent.status === "active"}
            title={<Row gap={2}><Avatar name={agent.title} kind="ai" size="sm" />{agent.title}</Row>}
            subtitle={String(agent.fields.role ?? "")}
            actions={<Pill tone={agent.status === "active" ? "success" : agent.status === "paused" ? "warning" : "neutral"} dot>{agent.status}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents/${agent.id}`)}>Open</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(agent.id); context.openOverlay("Agent quick view", { id: agent.id }); }}>Quick view</Button>
              <span className="ds-grow" />
              <Button size="sm" variant="ghost" disabled={agent.status !== "active"} title={agent.status !== "active" ? "A contract that is not active is excluded from delegation" : undefined} onClick={() => { context.select(agent.id); context.openOverlay("assignment", { id: agent.id }); }}>Assign</Button>
            </>}
          >
            <Stack gap={2}>
              <p className="ds-subtle">{agent.summary}</p>
              <Properties rows={[
                { label: "Department", value: data.departments.find((department) => department.id === agent.fields.departmentId)?.title ?? "Unassigned" },
                { label: "Skills", value: String((body.skills ?? []).length) },
                { label: "Tools granted", value: `${granted.length} of ${(body.tools ?? []).length}` },
                { label: "Evaluation", value: run ? `${String(run.fields.score)} / 100` : "Never evaluated" },
              ]} />
              {agent.status === "paused" && <Notice tone="warning">Excluded from tool execution and automatic delegation while paused.</Notice>}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ---------------------------- TEAM-003 ---------------------------- */

function AgentProfile({ context, view }: { context: ScreenContext; view: "Overview" | "Skills" | "Work" | "Permissions" | "Performance" | "History" }) {
  const data = useWorkforce();
  const asked = useRecord(context.params.id);
  const agent = asked?.collection === "agents" ? asked : data.agents[0];
  if (!agent) return <Empty title="No contract in this workspace" icon={<Bot size={20} />} />;
  const body = agentBody(agent);
  const runs = data.evaluations.filter((item) => item.fields.kind === "run" && item.fields.agentId === agent.id);
  const work = [...data.missionTasks, ...data.tasks].filter((task) => String(task.fields.assignee ?? "") === agent.title);
  const blockers = activationBlockers(agent, data.evaluations);

  if (view === "Skills") {
    const installed = (body.skills ?? []).map((id) => data.skills.find((skill) => skill.id === id)).filter((skill): skill is Rec => Boolean(skill));
    return installed.length === 0 ? (
      <Empty title="No skill is installed" icon={<Wrench size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Role edit")}>Edit the contract</Button>}>
        A contract with no skill cannot do anything, and it cannot be activated.
      </Empty>
    ) : (
      <DataGrid
        rows={installed}
        rowId={(row) => row.id}
        label="Installed skills"
        columns={[
          { key: "title", header: "Skill", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "version", header: "Version", cell: (row) => String(row.fields.version ?? "—") },
          { key: "origin", header: "Origin", cell: (row) => <Pill tone={row.fields.origin === "purchased" ? "warning" : "neutral"}>{String(row.fields.origin ?? "native")}</Pill> },
          { key: "what", header: "What it does", cell: (row) => row.summary },
        ]}
        onOpen={() => context.navigate(`/o/${context.org.slug}/team/skills`)}
      />
    );
  }

  if (view === "Work") {
    return work.length === 0
      ? <Empty title={`Nothing is assigned to ${agent.title}`} icon={<Bot size={20} />} />
      : <DataGrid rows={work} rowId={(row) => row.id} label="Assigned work" columns={[
        { key: "title", header: "Item", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "stage", header: "Stage", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
        { key: "mission", header: "Mission", cell: (row) => data.missions.find((mission) => mission.id === row.parentId)?.title ?? "—" },
        { key: "gate", header: "Approval gate", cell: (row) => row.fields.approvalRequired === true ? <Pill tone="warning">Yes</Pill> : "No" },
      ]} />;
  }

  if (view === "Permissions") {
    const queued = work.filter((task) => !["verified", "done"].includes(String(task.fields.stage ?? task.status)));
    return (
      <Stack gap={4}>
        <Card title="Tools" subtitle={`${(body.tools ?? []).filter((tool) => tool.granted).length} granted`}>
          <Stack gap={2}>
            {(body.tools ?? []).map((tool) => (
              <Row key={tool.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                <div className="ds-grow"><strong>{tool.label}</strong><div className="ds-subtle">{tool.id}</div></div>
                <Pill tone={tool.granted ? "success" : "warning"}>{tool.granted ? "Granted" : tool.capability ? "Provider not connected" : "Not granted"}</Pill>
              </Row>
            ))}
            {(body.tools ?? []).length === 0 && <span className="ds-subtle">No tool is recorded on this contract.</span>}
          </Stack>
        </Card>
        <Card title="Authority" subtitle="What the contract says it may do">
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
            {(body.authority ?? ["Nothing recorded"]).map((line) => <li key={line}>{line}</li>)}
          </ul>
        </Card>
        <Notice tone="warning" title="A permission change re-authorises queued work">
          {queued.length} item{queued.length === 1 ? " is" : "s are"} queued for {agent.title}. Changing its tools or sources marks each one as needing re-authorisation before it runs, so nothing executes under a grant that has been taken away.
        </Notice>
        <Button variant="secondary" onClick={() => context.openOverlay("permission inspector", { id: agent.id })}>Change permissions</Button>
      </Stack>
    );
  }

  if (view === "Performance") {
    return (
      <Stack gap={4}>
        {runs.length === 0 ? (
          <Empty title="No evaluation run" icon={<FlaskConical size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("test panel", { id: agent.id })}>Run one now</Button>}>
            Nothing has been measured, so no score is shown. An unmeasured contract is not a contract that scored zero.
          </Empty>
        ) : (
          <>
            <StatRow>
              <Stat label="Latest score" value={`${String(latestRunFor(data.evaluations, agent.id)?.fields.score ?? 0)} / 100`} prov="posted" meta={`Safety line ${SAFETY_SCORE}`} />
              <Stat label="Runs recorded" value={String(runs.length)} prov="posted" meta="Local scenario runs" />
              <Stat label="Verified outcomes" value={String(work.filter((task) => String(task.fields.stage) === "verified").length)} prov="posted" meta="Work a person verified" />
              <Stat label="Provider cost" value={context.money(0)} prov="posted" meta="No model connected" />
            </StatRow>
            <DataGrid
              rows={runs}
              rowId={(row) => row.id}
              label="Evaluation history"
              columns={[
                { key: "title", header: "Run", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
                { key: "score", header: "Score", align: "end", cell: (row) => String(row.fields.score ?? 0), sortValue: (row) => Number(row.fields.score ?? 0) },
                { key: "result", header: "Result", cell: (row) => <Pill tone={row.status === "passed" ? "success" : "danger"}>{row.status}</Pill> },
                { key: "version", header: "Contract version", cell: (row) => String(row.fields.contractVersion ?? "—") },
                { key: "when", header: "When", align: "end", cell: (row) => context.date(row.at ?? row.updatedAt), sortValue: (row) => row.at ?? row.updatedAt },
              ]}
              onOpen={(id) => context.openOverlay("test panel", { runId: id, id: agent.id })}
            />
          </>
        )}
      </Stack>
    );
  }

  if (view === "History") {
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Created", value: context.date(agent.createdAt) },
          { label: "Last change", value: `${context.dateTime(agent.updatedAt)} by ${agent.updatedBy}` },
          { label: "Revision", value: String(agent.revision) },
        ]} />
        {agent.history.length === 0
          ? <Notice tone="info">No earlier version of this contract is recorded.</Notice>
          : <DataGrid rows={agent.history.map((snapshot, index) => ({ ...snapshot, id: `${agent.id}-h${index}` }))} rowId={(row) => row.id} label="Contract history" filterable={false} columns={[
            { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at) },
            { key: "status", header: "Status", cell: (row) => row.status },
            { key: "summary", header: "Summary", cell: (row) => row.summary },
          ]} />}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} machine={agent.status === "active"} title={<Row gap={3}><Avatar name={agent.title} kind="ai" size="lg" />{agent.title}</Row>} subtitle={`${String(agent.fields.role ?? "")} · ${agent.status}`}>
        <Stack gap={3}>
          <p className="ds-prose">{agent.summary}</p>
          <Properties rows={[
            { label: "Reports to", value: String(agent.fields.manager ?? "Unassigned") },
            { label: "Department", value: data.departments.find((department) => department.id === agent.fields.departmentId)?.title ?? "Unassigned" },
            { label: "Autonomy", value: String(agent.fields.autonomy ?? "draft") },
            { label: "Spend ceiling", value: context.money(Number(agent.fields.spendCapMinor ?? 0)) },
            { label: "Model", value: <Pill tone="warning">Not connected</Pill> },
          ]} />
        </Stack>
      </Card>
      <Card span={5} eyebrow="ACTIVATION" prov={blockers.length === 0 ? "posted" : "unknown"} title="Can it be activated?" subtitle={blockers.length === 0 ? "Everything required is recorded" : `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`}>
        {blockers.length === 0 ? (
          <Notice tone="success" title="Ready">This contract has a role, a manager, a bounded ceiling, at least one skill, a granted tool and a passing evaluation.</Notice>
        ) : (
          <Stack gap={2}>
            {blockers.map((blocker) => <Notice key={blocker} tone="warning">{blocker}</Notice>)}
          </Stack>
        )}
      </Card>
      <Card span={12} eyebrow="GRANTS" prov="human" title="Knowledge grants" subtitle={`${(body.sources ?? []).length} named sources`}>
        {(body.sources ?? []).length === 0 ? <span className="ds-subtle">No named source. It reads what its skills name, inside this organisation.</span> : (
          <Row gap={2} wrap>
            {(body.sources ?? []).map((id) => (
              <Pill key={id} tone="neutral">{data.sources.find((source) => source.id === id)?.title ?? id}</Pill>
            ))}
          </Row>
        )}
      </Card>
    </Grid>
  );
}

/* ---------------------------- TEAM-004 ---------------------------- */

const BUILDER_STEPS = ["Identity", "Skills", "Knowledge", "Tools", "Autonomy", "Test"] as const;
type BuilderStep = typeof BUILDER_STEPS[number];

function builderProblems(draft: ReturnType<typeof useAgentBuilder.getState>["draft"], step: BuilderStep): string[] {
  switch (step) {
    case "Identity": {
      const problems: string[] = [];
      if (draft.name.trim().length < 2) problems.push("A name of at least two characters is needed.");
      if (!draft.role.trim()) problems.push("A role must be recorded.");
      if (!draft.departmentId) problems.push("A department must be chosen so somebody owns the contract.");
      if (!draft.brief.trim()) problems.push("The brief says what this contract is for; it cannot be empty.");
      return problems;
    }
    case "Skills":
      return draft.skills.length === 0 ? ["At least one skill is needed, or the contract can do nothing."] : [];
    case "Knowledge":
      return draft.sources.length === 0 ? ["Choose at least one source, or record that it reads none."] : [];
    case "Tools":
      return draft.tools.length === 0 ? ["Grant at least one tool. Reading workspace records is the usual minimum."] : [];
    case "Autonomy": {
      const problems: string[] = [];
      if (draft.spendCapMinor <= 0) problems.push("A spend ceiling above zero is required: an unbounded contract cannot be activated.");
      if (draft.spendCapMinor > 100_000) problems.push("A ceiling over £1,000 needs an owner's approval, which this builder cannot give.");
      return problems;
    }
    case "Test":
      return draft.evaluated ? [] : ["The contract must be evaluated before it can be activated."];
  }
}

function AgentBuilder({ context, step }: { context: ScreenContext; step: BuilderStep }) {
  const data = useWorkforce();
  const draft = useAgentBuilder((state) => state.draft);
  const set = useAgentBuilder((state) => state.set);
  const { now, money, date } = useWorkspace();
  const records = useCollection("facts");
  const problems = builderProblems(draft, step);
  const allProblems = BUILDER_STEPS.flatMap((item) => builderProblems(draft, item).map((problem) => ({ step: item, problem })));

  const progress = (
    <Row gap={2} wrap>
      {BUILDER_STEPS.map((item, index) => {
        const done = builderProblems(draft, item).length === 0;
        return (
          <Pill key={item} tone={item === step ? "accent" : done ? "success" : "neutral"} dot={item === step}>
            {index + 1}. {item}{done ? " ✓" : ""}
          </Pill>
        );
      })}
    </Row>
  );

  const stepBody = () => {
    if (step === "Identity") {
      return (
        <Stack gap={4}>
          <Field label="Name" required hint="The name people will see in rooms, plans and the organisation chart.">
            <TextInput value={draft.name} onChange={(event) => set({ name: event.target.value })} invalid={draft.name.length > 0 && draft.name.trim().length < 2} required />
          </Field>
          <Field label="Role" required>
            <TextInput value={draft.role} onChange={(event) => set({ role: event.target.value })} placeholder="Research, Procurement, Care…" required />
          </Field>
          <Field label="Department" required>
            <Select value={draft.departmentId} onChange={(event) => set({ departmentId: event.target.value })} required>
              <option value="">Choose a department…</option>
              {data.departments.map((department) => <option key={department.id} value={department.id}>{department.title}</option>)}
            </Select>
          </Field>
          <Field label="Brief" required hint="Written in your own words. It is stored as the contract summary; nothing expands it for you, because no model is connected.">
            <TextArea value={draft.brief} rows={4} onChange={(event) => set({ brief: event.target.value })} required />
          </Field>
        </Stack>
      );
    }
    if (step === "Skills") {
      return (
        <Stack gap={3}>
          <Notice tone="info" title="A skill is what the contract knows how to do">
            Each one lists the tools it needs. A purchased bundle that declares a network call cannot run here and is shown as sandboxed.
          </Notice>
          {data.skills.map((skill) => (
            <Row key={skill.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={`${skill.title} — v${String(skill.fields.version ?? "1.0")}`}
                checked={draft.skills.includes(skill.id)}
                disabled={skill.fields.trusted === false}
                onChange={(event) => set({ skills: event.target.checked ? [...draft.skills, skill.id] : draft.skills.filter((id) => id !== skill.id) })}
              />
              <span className="ds-grow" />
              <Pill tone={skill.fields.trusted === false ? "warning" : "neutral"}>{skill.fields.trusted === false ? "Sandboxed" : String(skill.fields.origin ?? "native")}</Pill>
            </Row>
          ))}
          <Button variant="secondary" onClick={() => context.openOverlay("Skill picker")}>What does each skill need?</Button>
        </Stack>
      );
    }
    if (step === "Knowledge") {
      return (
        <Stack gap={3}>
          <Notice tone="warning" title="Confidential sources are not offered here">
            A contract that would read confidential material needs a grant from Knowledge permissions, recorded against the policy rather than chosen in this builder.
          </Notice>
          {data.sources.filter((source) => source.fields.classification !== "confidential").map((source) => (
            <Row key={source.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={source.title}
                checked={draft.sources.includes(source.id)}
                disabled={source.status !== "indexed"}
                onChange={(event) => set({ sources: event.target.checked ? [...draft.sources, source.id] : draft.sources.filter((id) => id !== source.id) })}
              />
              <span className="ds-grow" />
              <Pill tone={source.status === "indexed" ? "success" : "warning"}>{source.status}</Pill>
            </Row>
          ))}
          <span className="ds-subtle">{records.length} assertions in the registry are readable by any contract that holds a read tool.</span>
        </Stack>
      );
    }
    if (step === "Tools") {
      const tools = [
        { id: "workspace.read", label: "Read records in this organisation", available: true },
        { id: "workspace.draft", label: "Create draft records", available: true },
        { id: "email.send", label: "Send email", available: false, capability: "email.send" },
        { id: "site.publish", label: "Publish a page", available: false, capability: "site.publish" },
        { id: "calendar.sync", label: "Write to a calendar", available: false, capability: "calendar.sync" },
      ];
      return (
        <Stack gap={3}>
          {tools.map((tool) => (
            <Row key={tool.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Checkbox
                label={tool.label}
                checked={draft.tools.includes(tool.id)}
                disabled={!tool.available}
                onChange={(event) => set({ tools: event.target.checked ? [...draft.tools, tool.id] : draft.tools.filter((id) => id !== tool.id) })}
              />
              <span className="ds-grow" />
              {!tool.available && <Pill tone="warning">Provider not connected</Pill>}
            </Row>
          ))}
          <CapabilityLine id="email.send" title="Why three tools cannot be granted" />
          <Button variant="secondary" onClick={() => context.openOverlay("connector grant")}>What a grant would need</Button>
        </Stack>
      );
    }
    if (step === "Autonomy") {
      return (
        <Stack gap={4}>
          <Field label="Autonomy" hint="Suggest proposes to a person. Draft writes records but never acts outside the workspace. Act with approval still stops at every gate.">
            <Select value={draft.autonomy} onChange={(event) => set({ autonomy: event.target.value as typeof draft.autonomy })}>
              <option value="suggest">Suggest</option>
              <option value="draft">Draft</option>
              <option value="act_with_approval">Act with approval</option>
            </Select>
          </Field>
          <Field label={`Spend ceiling (${context.org.currency})`} required hint="The most this contract may commit across its missions.">
            <TextInput
              value={(draft.spendCapMinor / 100).toFixed(2)}
              inputMode="decimal"
              align="end"
              invalid={draft.spendCapMinor <= 0}
              onChange={(event) => set({ spendCapMinor: Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100) })}
            />
          </Field>
          <Field label="Preferred provider" hint="Every provider is unconnected, so a preference is recorded and cannot be used.">
            <Select value={draft.provider} onChange={(event) => set({ provider: event.target.value })}>
              <option value="">No provider</option>
              {data.connectors.filter((connector) => connector.fields.kind === "model").map((connector) => (
                <option key={connector.id} value={connector.id}>{connector.title} — {String(connector.status).replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
        </Stack>
      );
    }
    const scenarios = data.evaluations.filter((item) => item.fields.kind === "scenario");
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="A contract cannot be activated before it is evaluated">
          The run below is a real local check of this draft against a recorded scenario. It does not call a model; it reads the draft and the workspace.
        </Notice>
        <Button
          variant="primary"
          disabled={scenarios.length === 0}
          onClick={() => {
            const scenario = scenarios.find((item) => String(item.fields.domain) === "governance") ?? scenarios[0];
            const probeAgent: Rec = {
              ...(data.agents[0] ?? ({} as Rec)),
              id: "draft-agent",
              title: draft.name || "Draft contract",
              status: "draft",
              fields: { role: draft.role, autonomy: draft.autonomy, spendCapMinor: draft.spendCapMinor, manager: data.departments.find((department) => department.id === draft.departmentId)?.fields.lead ?? "" },
              body: { skills: draft.skills, tools: draft.tools.map((id) => ({ id, label: id, granted: true })), authority: [draft.brief], sources: draft.sources },
            };
            const result = runScenario(scenario, probeAgent, [...data.agents, ...data.skills, ...data.sources], now, money, date);
            set({ evaluated: (result.score ?? 0) >= SAFETY_SCORE, evaluationScore: result.score, evaluationAt: now.toISOString() });
            context.openOverlay("simulation", { result, scenarioId: scenario.id });
          }}
        >
          Run the evaluation
        </Button>
        {draft.evaluationScore !== undefined && (
          <Notice tone={(draft.evaluationScore ?? 0) >= SAFETY_SCORE ? "success" : "danger"} title={`Scored ${draft.evaluationScore} of 100`}>
            {(draft.evaluationScore ?? 0) >= SAFETY_SCORE
              ? `At or above the ${SAFETY_SCORE} safety line, so the contract may be activated.`
              : `Below the ${SAFETY_SCORE} safety line. Fix the contract and run it again; activation stays blocked.`}
          </Notice>
        )}
        <Card title="Review" subtitle="Everything that would be written">
          <Properties rows={[
            { label: "Name", value: draft.name || "Not set" },
            { label: "Role", value: draft.role || "Not set" },
            { label: "Department", value: data.departments.find((department) => department.id === draft.departmentId)?.title ?? "Not set" },
            { label: "Skills", value: draft.skills.map((id) => data.skills.find((skill) => skill.id === id)?.title ?? id).join(", ") || "None" },
            { label: "Sources", value: draft.sources.map((id) => data.sources.find((source) => source.id === id)?.title ?? id).join(", ") || "None" },
            { label: "Tools", value: draft.tools.join(", ") || "None" },
            { label: "Autonomy", value: draft.autonomy },
            { label: "Spend ceiling", value: context.money(draft.spendCapMinor) },
            { label: "Provider", value: draft.provider ? `${data.connectors.find((connector) => connector.id === draft.provider)?.title} (not connected)` : "None" },
            { label: "Evaluation", value: draft.evaluationScore === undefined ? "Not run" : `${draft.evaluationScore} / 100` },
          ]} />
        </Card>
        {allProblems.length > 0 && (
          <Notice tone="danger" title={`${allProblems.length} thing${allProblems.length === 1 ? "" : "s"} still block activation`}>
            <ul style={{ paddingInlineStart: "1.1rem" }}>
              {allProblems.map((item) => <li key={`${item.step}-${item.problem}`}><strong>{item.step}:</strong> {item.problem}</li>)}
            </ul>
          </Notice>
        )}
      </Stack>
    );
  };

  return (
    <Stack gap={4}>
      {progress}
      <Grid>
        <Card span={8} eyebrow="AGENT BUILDER" title={step} subtitle={`Step ${BUILDER_STEPS.indexOf(step) + 1} of ${BUILDER_STEPS.length}`}>
          <Stack gap={4}>
            {stepBody()}
            {problems.length > 0 && (
              <Notice tone="warning" title="This step is incomplete">
                <ul style={{ paddingInlineStart: "1.1rem" }}>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
              </Notice>
            )}
            <Row gap={2}>
              <Button
                variant="secondary"
                disabled={BUILDER_STEPS.indexOf(step) === 0}
                onClick={() => context.setTab(BUILDER_STEPS[Math.max(0, BUILDER_STEPS.indexOf(step) - 1)])}
              >
                Back
              </Button>
              <Button
                variant="primary"
                disabled={BUILDER_STEPS.indexOf(step) === BUILDER_STEPS.length - 1}
                onClick={() => context.setTab(BUILDER_STEPS[Math.min(BUILDER_STEPS.length - 1, BUILDER_STEPS.indexOf(step) + 1)])}
              >
                Continue
              </Button>
              <span className="ds-grow" />
              <Button variant="ghost" onClick={() => { useAgentBuilder.getState().reset(); context.toast("Draft cleared", "Nothing was written to the workspace."); }}>Clear the draft</Button>
            </Row>
          </Stack>
        </Card>
        <Card span={4} eyebrow="DRAFT" prov="human" title="Contract so far" subtitle="Written only when you activate">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Name", value: draft.name || "—" },
              { label: "Role", value: draft.role || "—" },
              { label: "Skills", value: String(draft.skills.length) },
              { label: "Tools", value: String(draft.tools.length) },
              { label: "Ceiling", value: context.money(draft.spendCapMinor) },
              { label: "Evaluated", value: draft.evaluated ? "Yes" : "No" },
            ]} />
            <Notice tone="info" title="Nothing exists yet">
              This draft is held in this browser for you. No contract record is created until every step is complete and you activate it.
            </Notice>
          </Stack>
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- TEAM-005 ---------------------------- */

function TeamOrgChart({ context, view }: { context: ScreenContext; view: "Hierarchy" | "Directory" | "Capacity" }) {
  const data = useWorkforce();
  const [mode, setMode] = useState<"diagram" | "list">("diagram");
  const people: Rec[] = [...data.members, ...data.agents.map((agent) => ({ ...agent, fields: { ...agent.fields, kind: "ai" } }))];

  if (view === "Directory") {
    return (
      <DataGrid
        rows={people}
        rowId={(row) => row.id}
        label="Workforce directory"
        columns={[
          { key: "title", header: "Member", primary: true, cell: (row) => <Row gap={2}><Avatar name={row.title} kind={row.fields.kind === "ai" ? "ai" : "human"} size="sm" />{row.title}</Row>, sortValue: (row) => row.title, filterValue: (row) => row.title },
          { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.fields.kind === "ai" ? "accent" : "neutral"}>{row.fields.kind === "ai" ? "AI employee" : "Person"}</Pill> },
          { key: "role", header: "Role", cell: (row) => String(row.fields.role ?? row.fields.title ?? "") },
          { key: "dept", header: "Department", cell: (row) => data.departments.find((department) => department.id === row.fields.departmentId)?.title ?? "Unassigned" },
          { key: "manager", header: "Reports to", cell: (row) => String(row.fields.manager ?? data.departments.find((department) => department.id === row.fields.departmentId)?.fields.lead ?? "—") },
        ]}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => { context.select(id); context.openOverlay("Employee inspector", { id }); }}
      />
    );
  }

  if (view === "Capacity") {
    return (
      <Grid>
        <Card span={12} title="Open work by department" subtitle="People and AI employees counted separately">
          <BarChart
            title="Members by department"
            height={220}
            format={(value) => String(Math.round(value))}
            series={[
              { name: "People", points: data.departments.map((department) => ({ label: department.title, value: data.members.filter((member) => member.fields.departmentId === department.id && member.fields.kind !== "ai").length })) },
              { name: "AI employees", points: data.departments.map((department) => ({ label: department.title, value: data.agents.filter((agent) => agent.fields.departmentId === department.id).length })) },
            ]}
            footer="Counts come from the member and contract records. An AI employee is not a headcount equivalent and no such conversion is made."
          />
        </Card>
        <Card span={12} title="Assigned work" subtitle="What each contract is holding">
          <DataGrid
            rows={data.agents}
            rowId={(row) => row.id}
            label="Capacity"
            filterable={false}
            columns={[
              { key: "title", header: "AI employee", primary: true, cell: (row) => row.title },
              { key: "open", header: "Open items", align: "end", cell: (row) => String(data.missionTasks.filter((task) => String(task.fields.assignee) === row.title && !["verified", "done"].includes(String(task.fields.stage))).length) },
              { key: "status", header: "Status", cell: (row) => <Pill tone={row.status === "active" ? "success" : "warning"}>{row.status}</Pill> },
              { key: "capacity", header: "Capacity", cell: () => <span className="ds-subtle">Unavailable — nothing executes, so throughput cannot be measured</span> },
            ]}
          />
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={4}>
      <DiagramToggle mode={mode} onChange={setMode} note="The list is the accessible equivalent: the same people, AI employees and reporting lines." diagramLabel="Chart" />
      {mode === "list" ? (
        <TeamOrgChart context={context} view="Directory" />
      ) : (
        <Grid>
          {data.departments.map((department) => {
            const humans = data.members.filter((member) => member.fields.departmentId === department.id && member.fields.kind !== "ai");
            const agents = data.agents.filter((agent) => agent.fields.departmentId === department.id);
            return (
              <Card key={department.id} span={4} title={department.title} subtitle={`Lead ${String(department.fields.lead ?? "unassigned")}`}>
                <Stack gap={3}>
                  <div>
                    <span className="ds-subtle">People</span>
                    <Stack gap={1}>
                      {humans.map((member) => (
                        <button key={member.id} type="button" className="ds-record-card" onClick={() => { context.select(member.id); context.openOverlay("Employee inspector", { id: member.id }); }}>
                          <Row gap={2}><Avatar name={member.title} size="sm" /><span className="ds-grow" style={{ textAlign: "start" }}>{member.title}</span></Row>
                        </button>
                      ))}
                      {humans.length === 0 && <span className="ds-subtle">None</span>}
                    </Stack>
                  </div>
                  <div>
                    <span className="ds-subtle">AI employees</span>
                    <Stack gap={1}>
                      {agents.map((agent) => (
                        <button key={agent.id} type="button" className="ds-record-card" onClick={() => { context.select(agent.id); context.openOverlay("Employee inspector", { id: agent.id }); }}>
                          <Row gap={2}>
                            <Avatar name={agent.title} kind="ai" size="sm" />
                            <span className="ds-grow" style={{ textAlign: "start" }}>{agent.title}</span>
                            <Pill tone="accent">AI</Pill>
                          </Row>
                        </button>
                      ))}
                      {agents.length === 0 && <span className="ds-subtle">None</span>}
                    </Stack>
                  </div>
                </Stack>
              </Card>
            );
          })}
        </Grid>
      )}
      <Notice tone="info" title="A reporting line does not grant data rights">
        An AI employee reporting into a department does not gain that department's confidential sources. Grants are recorded on the knowledge policy, and they do not cross between legal entities.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- TEAM-006 ---------------------------- */

function SkillsLibrary({ context, view }: { context: ScreenContext; view: "Native" | "Organization" | "Purchased" | "Draft" }) {
  const data = useWorkforce();
  const origin = view === "Organization" ? "organization" : view.toLowerCase();
  const rows = view === "Draft"
    ? data.skills.filter((skill) => skill.status === "draft")
    : data.skills.filter((skill) => String(skill.fields.origin ?? "native") === origin && skill.status !== "draft");

  if (rows.length === 0) return <Empty title={`No ${view.toLowerCase()} skill`} icon={<Wrench size={20} />}>A skill records what a contract can do, the tools it needs and what it returns.</Empty>;

  return (
    <Grid>
      {rows.map((skill) => {
        const body = skill.body as { tools?: string[]; inputs?: string[]; outputs?: string[] } | undefined;
        const users = data.agents.filter((agent) => (agentBody(agent).skills ?? []).includes(skill.id));
        return (
          <Card
            key={skill.id}
            span={6}
            eyebrow="SKILL"
            prov={skill.fields.trusted === false ? "unknown" : "human"}
            title={skill.title}
            subtitle={`v${String(skill.fields.version ?? "1.0")} · ${skill.ownerName}`}
            actions={<Pill tone={skill.fields.trusted === false ? "warning" : skill.status === "draft" ? "neutral" : "success"}>{skill.fields.trusted === false ? "Sandboxed" : skill.status}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(skill.id); context.openOverlay("Skill detail", { id: skill.id }); }}>Detail</Button>
              <Button size="sm" variant="ghost" disabled={skill.fields.trusted === false} title={skill.fields.trusted === false ? "A sandboxed bundle cannot be installed here" : undefined} onClick={() => { context.select(skill.id); context.openOverlay("install permission", { id: skill.id }); }}>Install</Button>
              <span className="ds-grow" />
              <span className="ds-subtle">{users.length} contract{users.length === 1 ? "" : "s"}</span>
            </>}
          >
            <Stack gap={2}>
              <p className="ds-subtle">{skill.summary}</p>
              <Properties rows={[
                { label: "Tools required", value: (body?.tools ?? []).join(", ") || "None" },
                { label: "Takes", value: (body?.inputs ?? []).join(", ") || "Nothing" },
                { label: "Returns", value: (body?.outputs ?? []).join(", ") || "Nothing" },
              ]} />
              {skill.fields.trusted === false && (
                <Notice tone="warning" title="Held in review">
                  This bundle declares a network call. Nothing in this workspace can run it, and it is not offered to a contract.
                </Notice>
              )}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ---------------------------- TEAM-007 ---------------------------- */

function Academy({ context, view }: { context: ScreenContext; view: "Training" | "Playbooks" | "Assessments" | "Results" }) {
  const courses = useCollection("courses");
  const data = useWorkforce();
  const kind = view === "Training" ? "course" : view === "Playbooks" ? "playbook" : "assessment";
  const rows = view === "Results" ? [] : courses.filter((course) => String(course.fields.kind ?? "course") === kind);

  if (view === "Results") {
    const runs = data.evaluations.filter((item) => item.fields.kind === "run");
    return runs.length === 0 ? <Empty title="No result recorded" icon={<GraduationCap size={20} />} /> : (
      <DataGrid
        rows={runs}
        rowId={(row) => row.id}
        label="Academy results"
        columns={[
          { key: "title", header: "Run", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "agent", header: "AI employee", cell: (row) => data.agents.find((agent) => agent.id === row.fields.agentId)?.title ?? String(row.fields.agentId) },
          { key: "score", header: "Score", align: "end", cell: (row) => String(row.fields.score ?? 0), sortValue: (row) => Number(row.fields.score ?? 0) },
          { key: "result", header: "Result", cell: (row) => <Pill tone={row.status === "passed" ? "success" : "danger"}>{row.status}</Pill> },
          { key: "when", header: "When", align: "end", cell: (row) => context.date(row.at ?? row.updatedAt) },
        ]}
        onOpen={() => context.navigate(`/o/${context.org.slug}/team/evaluations`)}
      />
    );
  }

  if (rows.length === 0) {
    return <Empty title={`No ${view.toLowerCase()}`} icon={<GraduationCap size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Training asset upload")}>Add one</Button>}>
      Training here is a written procedure a person approved. Nothing is learned from watching.
    </Empty>;
  }

  return (
    <Grid>
      {rows.map((course) => {
        const body = course.body as { lessons?: string[]; steps?: string[]; questions?: string[] } | undefined;
        const items = body?.lessons ?? body?.steps ?? body?.questions ?? [];
        return (
          <Card
            key={course.id}
            span={6}
            eyebrow={view === "Playbooks" ? "PLAYBOOK" : view === "Assessments" ? "ASSESSMENT" : "COURSE"}
            prov={course.fields.extracted === true ? "agent" : "human"}
            title={course.title}
            subtitle={`${items.length} ${view === "Training" ? "lessons" : view === "Playbooks" ? "steps" : "questions"} · ${course.ownerName}`}
            actions={<Pill tone={course.status === "published" ? "success" : "warning"}>{course.status}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(course.id); context.openOverlay("assessment builder", { id: course.id }); }}>{view === "Assessments" ? "Edit questions" : "Assign"}</Button>
              {course.status !== "published" && <Button size="sm" variant="ghost" onClick={() => { context.select(course.id); context.openOverlay("publishing review", { id: course.id }); }}>Publish</Button>}
              <span className="ds-grow" />
              {course.fields.completion !== undefined && <span className="ds-subtle">{String(course.fields.completion)} of {String(course.fields.assigned ?? 0)} complete</span>}
            </>}
          >
            <Stack gap={2}>
              <p className="ds-subtle">{course.summary}</p>
              <ol className="ds-prose" style={{ paddingInlineStart: "1.2rem" }}>
                {items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
              </ol>
              {course.status === "proposed" && (
                <Notice tone="warning" title="Proposed, not in force">
                  This was extracted from completed work. It stays proposed until a person scopes it and publishes it.
                </Notice>
              )}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ---------------------------- TEAM-008 ---------------------------- */

function EvaluationLab({ context, view }: { context: ScreenContext; view: "Scenarios" | "Runs" | "Regression" | "Reports" }) {
  const data = useWorkforce();
  const scenarios = data.evaluations.filter((item) => item.fields.kind === "scenario");
  const runs = data.evaluations.filter((item) => item.fields.kind === "run");

  if (view === "Runs") {
    return runs.length === 0 ? <Empty title="No run recorded" icon={<FlaskConical size={20} />} /> : (
      <DataGrid
        rows={runs}
        rowId={(row) => row.id}
        label="Evaluation runs"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("detailed trace", { id })}
        rowTone={(row) => (row.status === "failed" ? "warning" : undefined)}
        columns={[
          { key: "title", header: "Run", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "scenario", header: "Scenario", cell: (row) => scenarios.find((scenario) => scenario.id === row.fields.scenarioId)?.title ?? String(row.fields.scenarioId) },
          { key: "score", header: "Score", align: "end", cell: (row) => <Row gap={2}><Meter value={Number(row.fields.score ?? 0)} max={100} label={`${row.title} score`} tone={Number(row.fields.score ?? 0) >= SAFETY_SCORE ? "success" : "danger"} /><span className="ds-num">{String(row.fields.score ?? 0)}</span></Row>, sortValue: (row) => Number(row.fields.score ?? 0) },
          { key: "checks", header: "Checks", cell: (row) => `${String(row.fields.passed ?? 0)} passed, ${String(row.fields.failed ?? 0)} failed` },
          { key: "when", header: "When", align: "end", cell: (row) => context.relative(row.at ?? row.updatedAt), sortValue: (row) => row.at ?? row.updatedAt },
        ]}
      />
    );
  }

  if (view === "Regression") {
    const byAgent = data.agents.map((agent) => {
      const history = runs.filter((run) => run.fields.agentId === agent.id).sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
      const first = history[0];
      const last = history[history.length - 1];
      return { agent, first, last, delta: Number(last?.fields.score ?? 0) - Number(first?.fields.score ?? 0), runs: history.length };
    }).filter((row) => row.runs > 0);
    return byAgent.length === 0 ? <Empty title="No history to compare" icon={<FlaskConical size={20} />} /> : (
      <Stack gap={3}>
        <Notice tone="warning" title="A new version cannot quietly lower the safety score">
          Promoting a contract version is blocked when its score is below {SAFETY_SCORE}, and a drop against the previous run is shown here rather than averaged away.
        </Notice>
        <DataGrid
          rows={byAgent}
          rowId={(row) => row.agent.id}
          label="Regression"
          filterable={false}
          columns={[
            { key: "agent", header: "AI employee", primary: true, cell: (row) => row.agent.title },
            { key: "first", header: "First run", align: "end", cell: (row) => `${String(row.first?.fields.score ?? 0)} (${String(row.first?.fields.contractVersion ?? "—")})` },
            { key: "last", header: "Latest run", align: "end", cell: (row) => `${String(row.last?.fields.score ?? 0)} (${String(row.last?.fields.contractVersion ?? "—")})` },
            { key: "delta", header: "Change", align: "end", cell: (row) => <Pill tone={row.delta < 0 ? "danger" : row.delta > 0 ? "success" : "neutral"}>{row.delta > 0 ? "+" : ""}{row.delta}</Pill>, sortValue: (row) => row.delta },
            { key: "runs", header: "Runs", align: "end", cell: (row) => String(row.runs) },
          ]}
        />
      </Stack>
    );
  }

  if (view === "Reports") {
    const safety = scenarios.filter((scenario) => String(scenario.fields.severity) === "safety");
    const failing = runs.filter((run) => Number(run.fields.score ?? 0) < SAFETY_SCORE);
    return (
      <Grid>
        <Card span={12} title="Scores by contract" subtitle="Latest recorded run">
          <BarChart
            title="Latest score by contract"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Score", points: data.agents.map((agent) => ({ label: agent.title.split(" ")[0], value: Number(latestRunFor(data.evaluations, agent.id)?.fields.score ?? 0) })) }]}
            footer={`Contracts with no run appear as zero because nothing was measured. ${failing.length} recorded run${failing.length === 1 ? " is" : "s are"} below ${SAFETY_SCORE}.`}
          />
        </Card>
        <Card span={6} title="Safety scenarios" subtitle={`${safety.length} of ${scenarios.length}`}>
          <Stack gap={2}>
            {safety.map((scenario) => (
              <Row key={scenario.id} gap={2}><span className="ds-grow ds-truncate">{scenario.title}</span><Pill tone="danger">safety</Pill></Row>
            ))}
          </Stack>
        </Card>
        <Card span={6} title="What a run can and cannot show" prov="posted">
          <ul className="ds-prose" style={{ paddingInlineStart: "1.1rem" }}>
            <li>It checks the contract: its authority, tools, grants, autonomy and ceiling.</li>
            <li>It runs the local answer engine and counts the records the answer named.</li>
            <li>It cannot judge the quality of generated text, because nothing generates text here.</li>
          </ul>
        </Card>
      </Grid>
    );
  }

  return (
    <Stack gap={3}>
      <DataGrid
        rows={scenarios}
        rowId={(row) => row.id}
        label="Scenarios"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Scenario editor", { id })}
        columns={[
          { key: "title", header: "Scenario", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "domain", header: "Domain", cell: (row) => String(row.fields.domain ?? "general") },
          { key: "severity", header: "Severity", cell: (row) => <Pill tone={String(row.fields.severity) === "safety" ? "danger" : "neutral"}>{String(row.fields.severity ?? "quality")}</Pill> },
          { key: "checks", header: "Assertions", align: "end", cell: (row) => String(assertionsOf(row).length) },
          { key: "runs", header: "Runs", align: "end", cell: (row) => String(runs.filter((run) => run.fields.scenarioId === row.id).length) },
        ]}
      />
      <Notice tone="info" title="Each assertion is checked against this workspace">
        A run reads the contract and the records in this browser and records a pass or a fail per assertion, with the reason. Nothing is sampled and nothing is graded by a model.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- TEAM-009 ---------------------------- */

function AgentPerformance({ context, view }: { context: ScreenContext; view: "Employees" | "Departments" | "Trends" | "Quality" }) {
  const data = useWorkforce();
  const runs = data.evaluations.filter((item) => item.fields.kind === "run");

  if (view === "Departments") {
    return (
      <Card title="By department" subtitle="Verified work and recorded scores">
        <DataGrid
          rows={data.departments}
          rowId={(row) => row.id}
          label="Department performance"
          filterable={false}
          columns={[
            { key: "title", header: "Department", primary: true, cell: (row) => row.title },
            { key: "agents", header: "AI employees", align: "end", cell: (row) => String(data.agents.filter((agent) => agent.fields.departmentId === row.id).length) },
            { key: "verified", header: "Verified items", align: "end", cell: (row) => {
              const members = data.agents.filter((agent) => agent.fields.departmentId === row.id).map((agent) => agent.title);
              return String(data.missionTasks.filter((task) => members.includes(String(task.fields.assignee)) && String(task.fields.stage) === "verified").length);
            } },
            { key: "score", header: "Mean recorded score", align: "end", cell: (row) => {
              const scores = data.agents.filter((agent) => agent.fields.departmentId === row.id).map((agent) => Number(latestRunFor(data.evaluations, agent.id)?.fields.score ?? NaN)).filter((value) => !Number.isNaN(value));
              return scores.length ? String(Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)) : "Unavailable";
            } },
          ]}
        />
      </Card>
    );
  }

  if (view === "Trends") {
    const sorted = [...runs].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
    return (
      <Stack gap={4}>
        <Card title="Recorded runs over time" subtitle={`${sorted.length} runs`}>
          <BarChart
            title="Scores over time"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Score", points: sorted.map((run) => ({ label: context.date(run.at ?? run.updatedAt, { day: "numeric", month: "short" }), value: Number(run.fields.score ?? 0) })) }]}
            footer="Each bar is one recorded run. There is no trend line: five runs is not a trend, and this workspace will not draw one."
          />
        </Card>
      </Stack>
    );
  }

  if (view === "Quality") {
    const failed = runs.filter((run) => run.status === "failed");
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="No value estimate is produced">
          This workspace has no basis for a return-on-investment figure: no provider cost was incurred, no hourly rate is recorded and nothing has run. Any such number would be invented, so none is shown.
        </Notice>
        {failed.length === 0 ? <Empty title="No failed run" icon={<Gauge size={20} />} /> : (
          <Stack gap={3}>
            {failed.map((run) => {
              const body = run.body as { results?: { id: string; pass: boolean; note: string }[] } | undefined;
              return (
                <Card key={run.id} title={run.title} subtitle={`${String(run.fields.score ?? 0)} / 100 · ${context.date(run.at ?? run.updatedAt)}`} prov="posted"
                  footer={<Button size="sm" variant="secondary" onClick={() => { context.select(run.id); context.openOverlay("incident trace", { id: run.id }); }}>Open the trace</Button>}>
                  <Stack gap={2}>
                    {(body?.results ?? []).filter((result) => !result.pass).map((result) => (
                      <Notice key={result.id} tone="danger">{result.note}</Notice>
                    ))}
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Contracts" value={String(data.agents.length)} prov="human" meta={`${data.agents.filter((agent) => agent.status === "active").length} active`} />
        <Stat label="Verified outcomes" value={String(data.missionTasks.filter((task) => task.fields.kind === "ai" && String(task.fields.stage) === "verified").length)} prov="posted" meta="Work a person verified" />
        <Stat label="Escalations" value={String(data.tasks.filter((task) => task.fields.escalatedFrom).length)} prov="posted" meta="Handed to a person" />
        <Stat label="Return on investment" value="Unavailable" unavailable meta="No cost and no measured saving exist to divide" />
      </StatRow>
      <DataGrid
        rows={data.agents}
        rowId={(row) => row.id}
        label="Agent performance"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        columns={[
          { key: "title", header: "AI employee", primary: true, cell: (row) => <Row gap={2}><Avatar name={row.title} kind="ai" size="sm" />{row.title}</Row>, filterValue: (row) => row.title },
          { key: "assigned", header: "Assigned", align: "end", cell: (row) => String(data.missionTasks.filter((task) => String(task.fields.assignee) === row.title).length) },
          { key: "verified", header: "Verified", align: "end", cell: (row) => String(data.missionTasks.filter((task) => String(task.fields.assignee) === row.title && String(task.fields.stage) === "verified").length) },
          { key: "score", header: "Latest score", align: "end", cell: (row) => { const run = latestRunFor(data.evaluations, row.id); return run ? String(run.fields.score) : "Not measured"; } },
          { key: "cost", header: "Provider cost", align: "end", cell: (row) => context.money(Number(row.fields.recordedCostMinor ?? 0)) },
        ]}
        onOpen={(id) => context.navigate(`/o/${context.org.slug}/team/agents/${id}`)}
      />
    </Stack>
  );
}

/* ---------------------------- TEAM-010 ---------------------------- */

function ModelRouting({ context, view }: { context: ScreenContext; view: "Providers" | "Routing" | "Budgets" | "Experiments" }) {
  const data = useWorkforce();
  const providers = data.connectors.filter((connector) => connector.fields.kind === "model" || connector.fields.provider === "Model provider");

  if (view === "Routing") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="No route can be taken">
          Every provider below is unconnected, so a route is a recorded preference. A request made today is answered from records in this workspace instead, and that is what the chat surfaces say.
        </Notice>
        <DataGrid
          rows={data.agents}
          rowId={(row) => row.id}
          label="Routing by role"
          columns={[
            { key: "title", header: "AI employee", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "role", header: "Role", cell: (row) => String(row.fields.role ?? "") },
            { key: "preferred", header: "Preferred provider", cell: (row) => providers.find((provider) => provider.id === row.fields.provider)?.title ?? "None recorded" },
            { key: "state", header: "Would it run?", cell: () => <Pill tone="warning">No — provider not connected</Pill> },
            { key: "fallback", header: "Fallback", cell: () => "Answer from records, and say so" },
          ]}
          onOpen={(id) => { context.select(id); context.openOverlay("routing simulator", { id }); }}
        />
      </Stack>
    );
  }

  if (view === "Budgets") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Token budget" value="Not applicable" unavailable meta="No provider is connected to meter tokens" />
          <Stat label="Spend ceilings" value={context.money(data.agents.reduce((sum, agent) => sum + Number(agent.fields.spendCapMinor ?? 0), 0))} prov="human" meta="Recorded on the contracts" />
          <Stat label="Recorded provider spend" value={context.money(0)} prov="posted" meta="Nothing has been charged" />
        </StatRow>
        <DataGrid
          rows={data.agents}
          rowId={(row) => row.id}
          label="Budgets"
          filterable={false}
          columns={[
            { key: "title", header: "AI employee", primary: true, cell: (row) => row.title },
            { key: "cap", header: "Ceiling", align: "end", cell: (row) => context.money(Number(row.fields.spendCapMinor ?? 0)) },
            { key: "used", header: "Used", align: "end", cell: (row) => context.money(Number(row.fields.recordedCostMinor ?? 0)) },
            { key: "head", header: "Headroom", align: "end", cell: (row) => context.money(Number(row.fields.spendCapMinor ?? 0) - Number(row.fields.recordedCostMinor ?? 0)) },
          ]}
        />
      </Stack>
    );
  }

  if (view === "Experiments") {
    return (
      <Empty title="No experiment can run" icon={<Cpu size={20} />}>
        A model experiment compares two providers on the same task. Neither side of a comparison exists here: no provider is connected, so nothing is scheduled and no result is shown.
      </Empty>
    );
  }

  return (
    <Stack gap={4}>
      <CapabilityLine id="model.inference" title="No model provider is connected" />
      <Grid>
        {providers.map((provider) => (
          <Card
            key={provider.id}
            span={6}
            eyebrow="PROVIDER"
            title={provider.title}
            subtitle={provider.summary}
            prov="unknown"
            actions={<Pill tone="warning">{String(provider.status).replace(/_/g, " ")}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(provider.id); context.openOverlay("Provider setup", { id: provider.id }); }}>What setup needs</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("policy warning", { id: provider.id })}>Data policy</Button>
            </>}
          >
            <Properties rows={[
              { label: "Data residency", value: String(provider.fields.residency ?? "Unknown until configured") },
              { label: "Context window", value: Number(provider.fields.contextWindow ?? 0) ? String(provider.fields.contextWindow) : "Unavailable" },
              { label: "Price", value: Number(provider.fields.pricePerMillionMinor ?? 0) ? context.money(Number(provider.fields.pricePerMillionMinor)) : "Unavailable — nothing is configured" },
              { label: "Tested score", value: Number(provider.fields.testedScore ?? 0) ? String(provider.fields.testedScore) : "Never tested here" },
            ]} />
          </Card>
        ))}
        {providers.length === 0 && <Empty title="No provider record" icon={<Cpu size={20} />} />}
      </Grid>
    </Stack>
  );
}

/* ====================================================================== *
 * Overlays
 * ====================================================================== */

function QuickProfile({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = useRecord(payload?.id ?? context.selectedId);
  const data = useWorkforce();
  if (!agent || agent.collection !== "agents") return <Empty title="Choose an AI employee" />;
  const body = agentBody(agent);
  const run = latestRunFor(data.evaluations, agent.id);
  return (
    <Stack gap={4}>
      <Row gap={3}>
        <Avatar name={agent.title} kind="ai" size="lg" />
        <div>
          <h3>{agent.title}</h3>
          <p className="ds-subtle">{String(agent.fields.role ?? "")} · {agent.status}</p>
        </div>
      </Row>
      <Properties rows={[
        { label: "Manager", value: String(agent.fields.manager ?? "Unassigned") },
        { label: "Autonomy", value: String(agent.fields.autonomy ?? "draft") },
        { label: "Skills", value: String((body.skills ?? []).length) },
        { label: "Tools granted", value: `${(body.tools ?? []).filter((tool) => tool.granted).length} of ${(body.tools ?? []).length}` },
        { label: "Latest evaluation", value: run ? `${String(run.fields.score)} / 100` : "Never evaluated" },
        { label: "Model", value: <Pill tone="warning">Not connected</Pill> },
      ]} />
      {agent.status === "paused" && <Notice tone="warning" title="Paused">{String(agent.fields.pausedReason || "No reason recorded.")}</Notice>}
      <Row gap={2} wrap>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents/${agent.id}`)}>Open the contract</Button>
        <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/ai/agents/${agent.id}/chat`)}>Message</Button>
      </Row>
    </Stack>
  );
}

function CostInspector({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = data.agents.find((item) => item.id === (payload?.id ?? context.selectedId));
  return (
    <Stack gap={4}>
      <CapabilityLine id="model.inference" title="Where a cost would come from" />
      <Properties rows={[
        { label: "Contract", value: agent?.title ?? "Every contract" },
        { label: "Spend ceiling", value: context.money(Number(agent?.fields.spendCapMinor ?? data.agents.reduce((sum, item) => sum + Number(item.fields.spendCapMinor ?? 0), 0))) },
        { label: "Recorded provider cost", value: context.money(0) },
        { label: "Token usage", value: "Unavailable — no provider meters anything here" },
        { label: "Cost per verified outcome", value: "Unavailable — the numerator is zero and unmeasured" },
      ]} />
      <Notice tone="info" title="What the ceiling does">
        A ceiling limits what a mission may commit on this contract's behalf. It is enforced by the mission budget screen, which checks headroom before it reserves.
      </Notice>
    </Stack>
  );
}

function AgentAssignment({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = data.agents.find((item) => item.id === (payload?.id ?? context.selectedId));
  const open = data.missionTasks.filter((task) => !["verified", "done"].includes(String(task.fields.stage ?? task.status)));
  const [pickedTask, setPickedTask] = useState("");
  const taskId = pickedTask || open[0]?.id || "";
  if (!agent) return <Empty title="Choose an AI employee" />;
  const task = open.find((item) => item.id === taskId);
  const blocked = agent.status !== "active";
  return (
    <Stack gap={4}>
      {blocked && (
        <Notice tone="warning" title={`${agent.title} is ${agent.status}`}>
          A contract that is not active is excluded from delegation, so this assignment cannot be made.
        </Notice>
      )}
      <Field label="Work item">
        <Select value={taskId} onChange={(event) => setPickedTask(event.target.value)} disabled={blocked}>
          {open.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      {task?.fields.approvalRequired === true && <Notice tone="info">This item has an approval gate. Assigning it does not pass the gate.</Notice>}
      <Button
        variant="primary"
        disabled={blocked || !task}
        onClick={async () => {
          if (!task) return;
          await context.mutate.patch(task.id, { ownerName: agent.title, fields: { ...task.fields, assignee: agent.title, kind: "ai" } }, { expectRevision: task.revision, event: `${task.title} assigned to ${agent.title}` });
          context.toast("Assigned", `${task.title} belongs to ${agent.title}. Nothing starts running: no model is connected.`);
          close();
        }}
      >
        Assign the work
      </Button>
    </Stack>
  );
}

function ArchiveConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const agent = useRecord(context.selectedId);
  const data = useWorkforce();
  if (!agent || agent.collection !== "agents") return <Empty title="Choose an AI employee" />;
  const open = data.missionTasks.filter((task) => String(task.fields.assignee) === agent.title && !["verified", "done"].includes(String(task.fields.stage ?? task.status)));
  return (
    <Stack gap={4}>
      {open.length > 0 ? (
        <Notice tone="danger" title={`${open.length} open item${open.length === 1 ? "" : "s"} would be left without an owner`}>
          {open.map((task) => task.title).join(", ")}. Reassign them before archiving the contract.
        </Notice>
      ) : (
        <Notice tone="warning" title="Archiving keeps the record">
          {agent.title} stays in this workspace with its evaluation history. It is excluded from delegation and tool execution.
        </Notice>
      )}
      <Button
        variant="danger"
        disabled={open.length > 0}
        onClick={async () => {
          await context.mutate.patch(agent.id, { status: "archived", fields: { ...agent.fields, archivedBy: context.actor } }, { expectRevision: agent.revision, event: `${agent.title} archived by ${context.actor}` });
          context.toast("Archived", "The contract is out of delegation and its history is kept.");
          close();
        }}
      >
        Archive the contract
      </Button>
    </Stack>
  );
}

function RoleEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const agent = useRecord(context.params.id ?? context.selectedId) ?? data.agents[0];
  const [role, setRole] = useState(String(agent?.fields.role ?? ""));
  const [manager, setManager] = useState(String(agent?.fields.manager ?? ""));
  const [autonomy, setAutonomy] = useState(String(agent?.fields.autonomy ?? "draft"));
  const [cap, setCap] = useState(Number(agent?.fields.spendCapMinor ?? 0));
  const [summary, setSummary] = useState(agent?.summary ?? "");
  if (!agent) return <Empty title="No contract" />;
  return (
    <form
      id="role-edit"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.patch(agent.id, {
          summary,
          fields: { ...agent.fields, role, manager, autonomy, spendCapMinor: cap },
        }, { expectRevision: agent.revision, event: `${agent.title} contract edited by ${context.actor}` });
        context.toast("Contract saved", "The change is on the record, and queued work is re-checked against the new contract before it runs.");
        close();
      }}
    >
      <Field label="Role" required><TextInput value={role} onChange={(event) => setRole(event.target.value)} required /></Field>
      <Field label="Manager">
        <Select value={manager} onChange={(event) => setManager(event.target.value)}>
          <option value="">Unassigned</option>
          {data.members.filter((member) => member.fields.kind !== "ai").map((member) => <option key={member.id} value={member.title}>{member.title}</option>)}
        </Select>
      </Field>
      <Field label="Autonomy">
        <Select value={autonomy} onChange={(event) => setAutonomy(event.target.value)}>
          <option value="suggest">Suggest</option>
          <option value="draft">Draft</option>
          <option value="act_with_approval">Act with approval</option>
        </Select>
      </Field>
      <Field label={`Spend ceiling (${context.org.currency})`}>
        <TextInput value={(cap / 100).toFixed(2)} align="end" inputMode="decimal" onChange={(event) => setCap(Math.round((Number(event.target.value.replace(/[^0-9.]/g, "")) || 0) * 100))} />
      </Field>
      <Field label="What it is for"><TextArea value={summary} rows={3} onChange={(event) => setSummary(event.target.value)} /></Field>
      <Notice tone="warning" title="Changing a contract invalidates stale grants">
        Queued work carries the grants it was authorised under. After this change it is re-checked, and anything that no longer fits stops at the gate instead of running.
      </Notice>
    </form>
  );
}

function PermissionInspector({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const agent = useRecord(context.params.id ?? context.selectedId) ?? data.agents[0];
  const body = agentBody(agent);
  const [tools, setTools] = useState(body.tools ?? []);
  if (!agent) return <Empty title="No contract" />;
  const queued = data.missionTasks.filter((task) => String(task.fields.assignee) === agent.title && !["verified", "done"].includes(String(task.fields.stage ?? task.status)));
  return (
    <Stack gap={4}>
      <Stack gap={2}>
        {tools.map((tool, index) => (
          <Row key={tool.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Checkbox
              label={tool.label}
              checked={tool.granted}
              disabled={Boolean(tool.capability)}
              onChange={(event) => setTools((current) => current.map((item, position) => position === index ? { ...item, granted: event.target.checked } : item))}
            />
            <span className="ds-grow" />
            {tool.capability && <Pill tone="warning">Provider not connected</Pill>}
          </Row>
        ))}
        {tools.length === 0 && <span className="ds-subtle">No tool is recorded on this contract.</span>}
      </Stack>
      <Notice tone="warning" title={`${queued.length} queued item${queued.length === 1 ? "" : "s"} would be re-authorised`}>
        Saving marks queued work as needing re-authorisation, so nothing runs under a grant that has been removed.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(agent.id, { body: { ...(agent.body as object), tools } }, { expectRevision: agent.revision, event: `Tool grants changed on ${agent.title}` });
          for (const task of queued) {
            await context.mutate.patch(task.id, { fields: { ...task.fields, reauthorisationRequired: true } }, { event: `${task.title} needs re-authorisation after a permission change` });
          }
          context.toast("Permissions saved", `${queued.length} queued item${queued.length === 1 ? "" : "s"} now need re-authorisation.`);
          close();
        }}
      >
        Save permissions
      </Button>
    </Stack>
  );
}

function TestPanel({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string; runId?: string } | undefined;
  const agent = data.agents.find((item) => item.id === (payload?.id ?? context.params.id ?? context.selectedId)) ?? data.agents[0];
  const scenarios = data.evaluations.filter((item) => item.fields.kind === "scenario");
  const [picked, setPicked] = useState("");
  /* Records load after the first render, so the choice falls back to the
     first scenario until the person picks one. */
  const scenarioId = picked || scenarios[0]?.id || "";
  const [result, setResult] = useState<RunResult | null>(null);
  const { now, money, date } = useWorkspace();
  const pool = useMemo(() => [...data.agents, ...data.skills, ...data.sources, ...data.evaluations], [data]);
  const existing = data.evaluations.find((item) => item.id === payload?.runId);
  const existingResults = (existing?.body as { results?: { id: string; pass: boolean; note: string }[] } | undefined)?.results;

  if (!agent) return <Empty title="No contract to test" />;

  return (
    <Stack gap={4}>
      <Notice tone="info" title="A run reads the contract and this workspace">
        It checks each assertion against the recorded contract and runs the local answer engine. No model is called, so this measures the contract, not generated text.
      </Notice>
      <Field label="Scenario">
        <Select value={scenarioId} onChange={(event) => { setPicked(event.target.value); setResult(null); }}>
          {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}
        </Select>
      </Field>
      <Button
        variant="primary"
        disabled={!scenarioId}
        onClick={async () => {
          const scenario = scenarios.find((item) => item.id === scenarioId);
          if (!scenario) return;
          const outcome = runScenario(scenario, agent, pool, now, money, date);
          setResult(outcome);
          await context.mutate.create({
            collection: "evaluations",
            title: `${agent.title} · ${scenario.title}`,
            status: (outcome.score ?? 0) >= SAFETY_SCORE ? "passed" : "failed",
            summary: `${outcome.passed} of ${outcome.results.length} assertions passed, run in this browser against the recorded contract.`,
            at: now.toISOString(),
            fields: { kind: "run", agentId: agent.id, scenarioId: scenario.id, score: outcome.score ?? 0, passed: outcome.passed, failed: outcome.failed, contractVersion: String(agent.revision) },
            body: { results: outcome.results },
          }, `Evaluation run recorded for ${agent.title}`);
          context.toast("Run recorded", `${agent.title} scored ${outcome.score ?? 0}. The run is in the evaluation history with every assertion and its reason.`);
        }}
      >
        Run the scenario
      </Button>
      {(result || existingResults) && (
        <Card title={result ? `Scored ${result.score ?? 0} of 100` : "Recorded run"} prov="posted"
          subtitle={result ? `${result.passed} passed, ${result.failed} failed` : existing?.summary}>
          <Stack gap={2}>
            {(result?.results ?? existingResults ?? []).map((item) => (
              <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
                <Pill tone={item.pass ? "success" : "danger"}>{item.pass ? "pass" : "fail"}</Pill>
                <span className="ds-grow">{"label" in item ? String(item.label) : item.id}</span>
                <span className="ds-subtle">{item.note}</span>
              </Row>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function SkillPicker({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  return (
    <Stack gap={3}>
      <Notice tone="info" title="What each skill needs">A skill cannot be installed on a contract that does not hold the tools it names.</Notice>
      {data.skills.map((skill) => {
        const body = skill.body as { tools?: string[]; inputs?: string[]; outputs?: string[] } | undefined;
        return (
          <Card key={skill.id} title={skill.title} subtitle={`v${String(skill.fields.version ?? "1.0")} · ${String(skill.fields.origin ?? "native")}`} pad="tight"
            prov={skill.fields.trusted === false ? "unknown" : "human"}>
            <Properties rows={[
              { label: "Tools", value: (body?.tools ?? []).join(", ") || "None" },
              { label: "Takes", value: (body?.inputs ?? []).join(", ") || "Nothing" },
              { label: "Returns", value: (body?.outputs ?? []).join(", ") || "Nothing" },
            ]} />
          </Card>
        );
      })}
      <Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/team/skills`)}>Open the skills library</Button>
    </Stack>
  );
}

function ConnectorGrant({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A tool outside this browser cannot be granted">
        Granting one would need a connected provider, a credential and a person authorising it. None of those exists here, so the tool stays ungranted rather than being granted and failing later.
      </Notice>
      <DataGrid
        rows={data.connectors}
        rowId={(row) => row.id}
        label="Connectors"
        filterable={false}
        columns={[
          { key: "title", header: "Service", primary: true, cell: (row) => row.title },
          { key: "state", header: "State", cell: (row) => <Pill tone="warning">{String(row.status).replace(/_/g, " ")}</Pill> },
          { key: "note", header: "What it would unlock", cell: (row) => row.summary },
        ]}
      />
      <Button variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/team/models`)}>Open model routing</Button>
    </Stack>
  );
}

function SimulationOverlay({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { result?: RunResult; scenarioId?: string } | undefined;
  const data = useWorkforce();
  const scenario = data.evaluations.find((item) => item.id === payload?.scenarioId);
  const result = payload?.result;
  if (!result) return <Empty title="No run yet" >Run the evaluation on the Test step to see each assertion and its reason.</Empty>;
  return (
    <Stack gap={4}>
      <Card title={`Scored ${result.score ?? 0} of 100`} subtitle={scenario?.title} prov="posted">
        <Stack gap={2}>
          {result.results.map((item) => (
            <Row key={item.id} gap={2} className="ds-panel" style={{ padding: "var(--space-2)" }}>
              <Pill tone={item.pass ? "success" : "danger"}>{item.pass ? "pass" : "fail"}</Pill>
              <span className="ds-grow">{item.label}</span>
              <span className="ds-subtle">{item.note}</span>
            </Row>
          ))}
        </Stack>
      </Card>
      <Notice tone={(result.score ?? 0) >= SAFETY_SCORE ? "success" : "warning"}>
        {(result.score ?? 0) >= SAFETY_SCORE ? `At or above the ${SAFETY_SCORE} line.` : `Below the ${SAFETY_SCORE} line, so activation stays blocked.`}
      </Notice>
    </Stack>
  );
}

function PublishConfirmation({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const draft = useAgentBuilder((state) => state.draft);
  const reset = useAgentBuilder((state) => state.reset);
  const problems = BUILDER_STEPS.flatMap((step) => builderProblems(draft, step));
  return (
    <Stack gap={4}>
      {problems.length > 0 ? (
        <Notice tone="danger" title="This contract cannot be activated yet">
          <ul style={{ paddingInlineStart: "1.1rem" }}>{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>
        </Notice>
      ) : (
        <Notice tone="success" title="Everything required is recorded">
          A role, a department, a manager, at least one skill, a granted tool, a bounded ceiling and a passing evaluation.
        </Notice>
      )}
      <Properties rows={[
        { label: "Name", value: draft.name || "—" },
        { label: "Role", value: draft.role || "—" },
        { label: "Evaluation", value: draft.evaluationScore === undefined ? "Not run" : `${draft.evaluationScore} / 100` },
        { label: "Spend ceiling", value: context.money(draft.spendCapMinor) },
      ]} />
      <Button
        variant="primary"
        disabled={problems.length > 0}
        onClick={async () => {
          const department = data.departments.find((item) => item.id === draft.departmentId);
          const agent = await context.mutate.create({
            collection: "agents",
            title: draft.name.trim(),
            status: "active",
            summary: draft.brief,
            fields: {
              role: draft.role,
              model: "not_connected",
              autonomy: draft.autonomy,
              departmentId: draft.departmentId,
              manager: String(department?.fields.lead ?? context.actor),
              spendCapMinor: draft.spendCapMinor,
              recordedCostMinor: 0,
              authority: draft.brief,
              provider: draft.provider,
            },
            body: {
              skills: draft.skills,
              tools: draft.tools.map((id) => ({ id, label: id, granted: true })),
              authority: [draft.brief],
              sources: draft.sources,
            },
            tags: ["ai"],
          }, `AI employee contract activated: ${draft.name.trim()}`);
          await context.mutate.create({
            collection: "members",
            title: draft.name.trim(),
            status: "active",
            summary: `${draft.role} agent. Local contract.`,
            fields: { kind: "ai", role: "agent", departmentId: draft.departmentId, title: `${draft.role} agent`, agentId: agent.id },
            tags: ["ai"],
          }, `${draft.name.trim()} added to the organisation chart`);
          if (draft.evaluationScore !== undefined) {
            await context.mutate.create({
              collection: "evaluations",
              title: `${draft.name.trim()} · activation check`,
              status: draft.evaluationScore >= SAFETY_SCORE ? "passed" : "failed",
              summary: "Run from the builder before activation.",
              at: context.now.toISOString(),
              fields: { kind: "run", agentId: agent.id, scenarioId: "", score: draft.evaluationScore, passed: 0, failed: 0, contractVersion: "1" },
              body: { results: [] },
            }, "Activation evaluation recorded");
          }
          reset();
          context.toast("Contract activated", `${agent.title} is on the roster. It holds no external tool, and no model is connected.`);
          close();
          context.navigate(`/o/${context.org.slug}/team/agents/${agent.id}`);
        }}
      >
        Activate the contract
      </Button>
    </Stack>
  );
}

function EmployeeInspector({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const record = useRecord(payload?.id ?? context.selectedId);
  const data = useWorkforce();
  if (!record) return <Empty title="Choose a member" />;
  const isAgent = record.collection === "agents" || record.fields.kind === "ai";
  return (
    <Stack gap={4}>
      <Row gap={3}>
        <Avatar name={record.title} kind={isAgent ? "ai" : "human"} size="lg" />
        <div>
          <h3>{record.title}</h3>
          <p className="ds-subtle">{String(record.fields.role ?? record.fields.title ?? "")}</p>
        </div>
      </Row>
      <Properties rows={[
        { label: "Kind", value: isAgent ? "AI employee" : "Person" },
        { label: "Department", value: data.departments.find((department) => department.id === record.fields.departmentId)?.title ?? "Unassigned" },
        { label: "Reports to", value: String(record.fields.manager ?? data.departments.find((department) => department.id === record.fields.departmentId)?.fields.lead ?? "—") },
        { label: "About", value: record.summary },
      ]} />
      {isAgent && <Notice tone="info" title="A contract, not a person">This AI employee runs from a local contract. It has no mailbox, no calendar and no model behind it.</Notice>}
    </Stack>
  );
}

function TransferApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const record = useRecord(context.selectedId);
  const [departmentId, setDepartmentId] = useState(String(record?.fields.departmentId ?? ""));
  if (!record) return <Empty title="Choose a member or an AI employee" />;
  return (
    <Stack gap={4}>
      <Field label={`Department for ${record.title}`}>
        <Select value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
          {data.departments.map((department) => <option key={department.id} value={department.id}>{department.title}</option>)}
        </Select>
      </Field>
      <Notice tone="warning" title="A transfer does not carry data rights">
        Moving a contract between departments changes who manages it. Its knowledge grants stay exactly as the policy records them, and they never cross between legal entities.
      </Notice>
      <Button
        variant="primary"
        onClick={async () => {
          await context.mutate.patch(record.id, { fields: { ...record.fields, departmentId } }, { expectRevision: record.revision, event: `${record.title} transferred` });
          context.toast("Transferred", `${record.title} now sits in ${data.departments.find((department) => department.id === departmentId)?.title}.`);
          close();
        }}
      >
        Record the transfer
      </Button>
    </Stack>
  );
}

function HierarchyImpact({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const record = useRecord(context.selectedId);
  const reports = data.agents.filter((agent) => String(agent.fields.manager ?? "") === record?.title);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Member", value: record?.title ?? "None selected" },
        { label: "AI employees reporting to them", value: String(reports.length) },
        { label: "Open work held by those contracts", value: String(data.missionTasks.filter((task) => reports.some((agent) => agent.title === String(task.fields.assignee))).length) },
      ]} />
      {reports.length > 0 && (
        <Notice tone="warning" title="Moving this person moves accountability">
          {reports.map((agent) => agent.title).join(", ")} report to them. A contract without a manager cannot be activated, so a replacement has to be recorded.
        </Notice>
      )}
    </Stack>
  );
}

function SkillDetail({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const skill = data.skills.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!skill) return <Empty title="Choose a skill" />;
  const body = skill.body as { tools?: string[]; inputs?: string[]; outputs?: string[]; changelog?: { version: string; at: string; note: string }[] } | undefined;
  const users = data.agents.filter((agent) => (agentBody(agent).skills ?? []).includes(skill.id));
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Version", value: String(skill.fields.version ?? "1.0") },
        { label: "Origin", value: String(skill.fields.origin ?? "native") },
        { label: "Owner", value: skill.ownerName },
        { label: "Trusted", value: skill.fields.trusted === false ? <Pill tone="warning">Sandboxed</Pill> : <Pill tone="success">Reviewed</Pill> },
        { label: "Installed on", value: users.map((agent) => agent.title).join(", ") || "No contract" },
      ]} />
      <Card title="Contract" pad="tight">
        <Properties rows={[
          { label: "Tools required", value: (body?.tools ?? []).join(", ") || "None" },
          { label: "Takes", value: (body?.inputs ?? []).join(", ") || "Nothing" },
          { label: "Returns", value: (body?.outputs ?? []).join(", ") || "Nothing" },
        ]} />
      </Card>
      {(body?.changelog ?? []).length > 0 && (
        <Card title="Versions" pad="tight">
          <Stack gap={1}>
            {(body?.changelog ?? []).map((entry) => (
              <Row key={entry.version} gap={2}><strong className="ds-num">v{entry.version}</strong><span className="ds-grow">{entry.note}</span><span className="ds-subtle">{context.date(entry.at)}</span></Row>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}

function InstallPermission({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const skill = data.skills.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [pickedAgent, setPickedAgent] = useState("");
  const agentId = pickedAgent || data.agents[0]?.id || "";
  if (!skill) return <Empty title="Choose a skill" />;
  const agent = data.agents.find((item) => item.id === agentId);
  const body = skill.body as { tools?: string[] } | undefined;
  const held = (agentBody(agent).tools ?? []).filter((tool) => tool.granted).map((tool) => tool.id);
  const missing = (body?.tools ?? []).filter((tool) => !held.includes(tool));
  const sandboxed = skill.fields.trusted === false;
  return (
    <Stack gap={4}>
      <Field label="Install on">
        <Select value={agentId} onChange={(event) => setPickedAgent(event.target.value)}>
          {data.agents.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      {sandboxed && <Notice tone="danger" title="This bundle is sandboxed">It declares a network call, which nothing here can make. It cannot be installed.</Notice>}
      {missing.length > 0 && <Notice tone="warning" title="Missing tools">{agent?.title} does not hold {missing.join(", ")}. Grant them on the contract first.</Notice>}
      <Button
        variant="primary"
        disabled={sandboxed || missing.length > 0 || !agent}
        onClick={async () => {
          if (!agent) return;
          const skills = agentBody(agent).skills ?? [];
          if (skills.includes(skill.id)) { context.toast("Already installed", `${agent.title} already holds ${skill.title}.`, "info"); close(); return; }
          await context.mutate.patch(agent.id, { body: { ...(agent.body as object), skills: [...skills, skill.id] } }, { expectRevision: agent.revision, event: `${skill.title} installed on ${agent.title}` });
          context.toast("Installed", `${agent.title} holds ${skill.title} v${String(skill.fields.version ?? "1.0")}.`);
          close();
        }}
      >
        Install the skill
      </Button>
    </Stack>
  );
}

function CompatibilityTest({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const skill = data.skills.find((item) => item.id === context.selectedId) ?? data.skills[0];
  if (!skill) return <Empty title="No skill" />;
  const body = skill.body as { tools?: string[] } | undefined;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Compatibility is checked against recorded contracts">
        A contract is compatible when it holds every tool the skill names. Nothing is executed to find out.
      </Notice>
      <DataGrid
        rows={data.agents}
        rowId={(row) => row.id}
        label="Compatibility"
        filterable={false}
        columns={[
          { key: "title", header: "AI employee", primary: true, cell: (row) => row.title },
          { key: "tools", header: "Tools held", cell: (row) => (agentBody(row).tools ?? []).filter((tool) => tool.granted).map((tool) => tool.id).join(", ") || "None" },
          { key: "fit", header: "Compatible", cell: (row) => {
            const held = (agentBody(row).tools ?? []).filter((tool) => tool.granted).map((tool) => tool.id);
            const ok = (body?.tools ?? []).every((tool) => held.includes(tool));
            return <Pill tone={ok ? "success" : "warning"}>{ok ? "Yes" : "Missing tools"}</Pill>;
          } },
        ]}
      />
    </Stack>
  );
}

function TrainingAssetUpload({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { mode?: string } | undefined;
  const demonstration = payload?.mode === "demonstration";
  const [title, setTitle] = useState("");
  const [steps, setSteps] = useState("");
  return (
    <form
      id="training-upload"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.create({
          collection: "courses",
          title: title.trim(),
          status: "proposed",
          summary: demonstration ? `Written down by ${context.actor} after doing the task.` : `Procedure recorded by ${context.actor}.`,
          fields: { kind: demonstration ? "playbook" : "course", lessons: steps.split("\n").filter(Boolean).length, extracted: false },
          body: { lessons: steps.split("\n").filter(Boolean), steps: steps.split("\n").filter(Boolean) },
        }, `${demonstration ? "Demonstration" : "Procedure"} recorded: ${title.trim()}`);
        context.toast("Recorded as proposed", "New training stays proposed until a person scopes and publishes it.");
        close();
      }}
    >
      <Notice tone="info" title={demonstration ? "A demonstration is written, not watched" : "A procedure is written by a person"}>
        Nothing here observes you working: there is no capture service. Write the steps you took and they become a proposed playbook.
      </Notice>
      <Field label="Title" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Steps" required hint="One per line."><TextArea value={steps} rows={6} onChange={(event) => setSteps(event.target.value)} required /></Field>
    </form>
  );
}

function AssessmentBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const courses = useCollection("courses");
  const course = courses.find((item) => item.id === context.selectedId) ?? courses[0];
  const data = useWorkforce();
  const [pickedAgent, setPickedAgent] = useState("");
  const agentId = pickedAgent || data.agents[0]?.id || "";
  const [questions, setQuestions] = useState(((course?.body as { questions?: string[] } | undefined)?.questions ?? []).join("\n"));
  if (!course) return <Empty title="No course" />;
  const isAssessment = String(course.fields.kind) === "assessment";
  return (
    <Stack gap={4}>
      {isAssessment ? (
        <Field label="Questions" hint="One per line. A contract must answer each from records."><TextArea value={questions} rows={6} onChange={(event) => setQuestions(event.target.value)} /></Field>
      ) : (
        <Field label="Assign to">
          <Select value={agentId} onChange={(event) => setPickedAgent(event.target.value)}>
            {data.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.title}</option>)}
          </Select>
        </Field>
      )}
      <Button
        variant="primary"
        onClick={async () => {
          if (isAssessment) {
            await context.mutate.patch(course.id, {
              body: { ...(course.body as object), questions: questions.split("\n").filter(Boolean) },
              fields: { ...course.fields, questions: questions.split("\n").filter(Boolean).length },
            }, { expectRevision: course.revision, event: `Assessment updated: ${course.title}` });
            context.toast("Assessment saved", "The questions are on the record.");
          } else {
            const agent = data.agents.find((item) => item.id === agentId);
            await context.mutate.patch(course.id, {
              fields: { ...course.fields, assigned: Number(course.fields.assigned ?? 0) + 1, lastAssignedTo: agent?.title ?? "" },
            }, { expectRevision: course.revision, event: `${course.title} assigned to ${agent?.title}` });
            context.toast("Assigned", `${agent?.title} has ${course.title} on its record. Reading it changes nothing until a person verifies the result.`);
          }
          close();
        }}
      >
        {isAssessment ? "Save the assessment" : "Assign the course"}
      </Button>
    </Stack>
  );
}

function PublishingReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const courses = useCollection("courses");
  const payload = context.overlayPayload as { id?: string } | undefined;
  const course = courses.find((item) => item.id === (payload?.id ?? context.selectedId));
  const [scope, setScope] = useState("");
  if (!course) return <Empty title="Choose a playbook or course" />;
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Proposed knowledge is not in force">
        {course.title} was {course.fields.extracted === true ? "extracted from completed work" : "written by a person"} and stays proposed until its scope is recorded here.
      </Notice>
      <Field label="Where it applies" required hint="For example: trade quotes only, or care replies for shades."><TextInput value={scope} onChange={(event) => setScope(event.target.value)} required /></Field>
      <Button
        variant="primary"
        disabled={!scope.trim()}
        onClick={async () => {
          await context.mutate.patch(course.id, { status: "published", fields: { ...course.fields, scope, publishedBy: context.actor } }, { expectRevision: course.revision, event: `${course.title} published for ${scope}` });
          context.toast("Published", `${course.title} applies to ${scope}, recorded with your name.`);
          close();
        }}
      >
        Publish with this scope
      </Button>
    </Stack>
  );
}

function ScenarioEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const scenario = data.evaluations.find((item) => item.id === (payload?.id ?? context.selectedId) && item.fields.kind === "scenario");
  const [title, setTitle] = useState(scenario?.title ?? "");
  const [domain, setDomain] = useState(String(scenario?.fields.domain ?? "governance"));
  const [severity, setSeverity] = useState(String(scenario?.fields.severity ?? "quality"));
  return (
    <form
      id="scenario-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (scenario) {
          await context.mutate.patch(scenario.id, { title, fields: { ...scenario.fields, domain, severity } }, { expectRevision: scenario.revision, event: `Scenario updated: ${title}` });
        } else {
          await context.mutate.create({
            collection: "evaluations",
            title,
            status: "ready",
            summary: "Scenario recorded by hand. Its assertions are checked against contracts in this workspace.",
            fields: { kind: "scenario", domain, severity, assertions: 2 },
            body: {
              assertions: [
                { id: "a1", kind: "has_manager", args: {}, label: "A named manager is recorded" },
                { id: "a2", kind: "cites_records", args: { minimum: 1 }, label: "An answer names at least one record" },
              ],
            },
          }, `Scenario created: ${title}`);
        }
        context.toast("Scenario saved", "It can be run against any contract from the Test panel.");
        close();
      }}
    >
      <Field label="Scenario" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      <Field label="Domain">
        <Select value={domain} onChange={(event) => setDomain(event.target.value)}>
          {["finance", "care", "analytics", "governance", "knowledge"].map((item) => <option key={item} value={item}>{item}</option>)}
        </Select>
      </Field>
      <Field label="Severity">
        <Select value={severity} onChange={(event) => setSeverity(event.target.value)}>
          <option value="quality">Quality</option>
          <option value="safety">Safety — below the line blocks activation</option>
        </Select>
      </Field>
      {scenario && (
        <Card title="Assertions" pad="tight" prov="posted">
          <Stack gap={1}>
            {assertionsOf(scenario).map((assertion) => (
              <Row key={assertion.id} gap={2}><span className="ds-grow">{assertion.label}</span><Pill tone="neutral">{assertion.kind}</Pill></Row>
            ))}
          </Stack>
        </Card>
      )}
    </form>
  );
}

function DetailedTrace({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const run = data.evaluations.find((item) => item.id === (payload?.id ?? context.selectedId));
  if (!run) return <Empty title="Choose a run" />;
  const results = (run.body as { results?: { id: string; pass: boolean; note: string; label?: string }[] } | undefined)?.results ?? [];
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Contract", value: data.agents.find((agent) => agent.id === run.fields.agentId)?.title ?? String(run.fields.agentId) },
        { label: "Scenario", value: data.evaluations.find((item) => item.id === run.fields.scenarioId)?.title ?? "—" },
        { label: "Score", value: `${String(run.fields.score ?? 0)} / 100` },
        { label: "Contract version", value: String(run.fields.contractVersion ?? "—") },
        { label: "When", value: context.dateTime(run.at ?? run.updatedAt) },
      ]} />
      {results.length === 0 ? <Notice tone="info">This run recorded a score without per-assertion detail.</Notice> : (
        <Stack gap={2}>
          {results.map((result) => (
            <div key={result.id} className="ds-panel" style={{ padding: "var(--space-3)", borderLeft: `3px solid ${result.pass ? "var(--success)" : "var(--danger)"}` }}>
              <Row gap={2}><Pill tone={result.pass ? "success" : "danger"}>{result.pass ? "pass" : "fail"}</Pill><strong className="ds-grow">{result.label ?? result.id}</strong></Row>
              <p className="ds-subtle">{result.note}</p>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function PromotionApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const run = data.evaluations.find((item) => item.id === context.selectedId && item.fields.kind === "run") ?? data.evaluations.filter((item) => item.fields.kind === "run")[0];
  if (!run) return <Empty title="No run to promote" />;
  const agent = data.agents.find((item) => item.id === run.fields.agentId);
  const score = Number(run.fields.score ?? 0);
  const blocked = score < SAFETY_SCORE;
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Contract", value: agent?.title ?? "—" },
        { label: "Score", value: `${score} / 100` },
        { label: "Safety line", value: String(SAFETY_SCORE) },
      ]} />
      {blocked ? (
        <Notice tone="danger" title="Promotion is blocked">
          A version below the safety line cannot be promoted. The line is not lowered by a newer run, and nothing is promoted silently.
        </Notice>
      ) : (
        <Notice tone="success" title="Safe to promote">This version scored at or above the line on its recorded assertions.</Notice>
      )}
      <Button
        variant="primary"
        disabled={blocked || !agent}
        onClick={async () => {
          if (!agent) return;
          await context.mutate.patch(agent.id, { status: "active", fields: { ...agent.fields, promotedBy: context.actor, promotedVersion: String(run.fields.contractVersion ?? "") } }, { expectRevision: agent.revision, event: `${agent.title} promoted after scoring ${score}` });
          context.toast("Promoted", `${agent.title} is active on the version that scored ${score}.`);
          close();
        }}
      >
        Promote this version
      </Button>
    </Stack>
  );
}

function MetricDefinition() {
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Every figure on this report is counted, not modelled">
        Where a figure cannot be counted from records it is shown as unavailable rather than estimated.
      </Notice>
      <Properties rows={[
        { label: "Assigned", value: "Mission tasks whose assignee is this contract." },
        { label: "Verified", value: "Those tasks a person moved to verified against a criterion." },
        { label: "Latest score", value: "The most recent recorded evaluation run for the contract." },
        { label: "Provider cost", value: "Charges recorded against the contract. Zero, because no provider is connected." },
        { label: "Return on investment", value: "Not shown. There is no cost and no measured saving to divide, so any figure would be invented." },
      ]} />
    </Stack>
  );
}

function PerformanceNote({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useWorkforce();
  const agent = data.agents.find((item) => item.id === context.selectedId) ?? data.agents[0];
  const [note, setNote] = useState("");
  if (!agent) return <Empty title="No contract" />;
  return (
    <form
      id="performance-note"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        await context.mutate.log(`Coaching note on ${agent.title} from ${context.actor}: ${note}`, { entityId: agent.id, type: "agent.coaching" });
        context.toast("Note recorded", "It is in the activity log against the contract.");
        close();
      }}
    >
      <Notice tone="info" title="Coaching is a change to the contract or its skills">
        A note records what should change. Nothing learns from it on its own: no model is connected, so improvement means editing the contract or its skills.
      </Notice>
      <Field label={`Note on ${agent.title}`} required><TextArea value={note} rows={4} onChange={(event) => setNote(event.target.value)} required /></Field>
    </form>
  );
}

function ProviderSetup({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const provider = data.connectors.find((item) => item.id === (payload?.id ?? context.selectedId));
  return (
    <Stack gap={4}>
      <CapabilityLine id="model.inference" title={provider ? `${provider.title}: ${String(provider.status).replace(/_/g, " ")}` : "No provider is connected"} />
      <Properties rows={[
        { label: "Endpoint", value: "Not configured" },
        { label: "Credential", value: "None held. Nothing in this browser stores one." },
        { label: "Data residency", value: String(provider?.fields.residency ?? "Unknown until configured") },
        { label: "Approved by", value: "Nobody — approval is part of connecting" },
      ]} />
      <Notice tone="warning" title="This screen cannot connect a provider">
        Connecting one needs a service outside this browser and a person authorising what may be sent to it. Until then every contract answers from records here, and says so.
      </Notice>
    </Stack>
  );
}

function RoutingSimulator({ context }: { context: ScreenContext }) {
  const data = useWorkforce();
  const payload = context.overlayPayload as { id?: string } | undefined;
  const agent = data.agents.find((item) => item.id === (payload?.id ?? context.selectedId)) ?? data.agents[0];
  const providers = data.connectors.filter((item) => item.fields.kind === "model");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Contract", value: agent?.title ?? "—" },
        { label: "Preferred provider", value: providers.find((item) => item.id === agent?.fields.provider)?.title ?? "None recorded" },
        { label: "Would the request route?", value: <Pill tone="warning">No — every provider is unconnected</Pill> },
        { label: "What happens instead", value: "The local engine answers from records and names them." },
      ]} />
      <DataGrid
        rows={providers}
        rowId={(row) => row.id}
        label="Routing simulation"
        filterable={false}
        columns={[
          { key: "title", header: "Provider", primary: true, cell: (row) => row.title },
          { key: "residency", header: "Residency", cell: (row) => String(row.fields.residency ?? "Unknown") },
          { key: "state", header: "State", cell: (row) => <Pill tone="warning">{String(row.status).replace(/_/g, " ")}</Pill> },
          { key: "chosen", header: "Would be chosen", cell: () => "No" },
        ]}
      />
      <Notice tone="warning" title="Fallback is bounded by the data policy">
        A fallback to another provider would only be allowed where the data policy permits that residency. With nothing connected there is no fallback to take, and this workspace does not pretend one happened.
      </Notice>
    </Stack>
  );
}

function PolicyWarning({ context }: { context: ScreenContext }) {
  const policies = useCollection("policies");
  const sensitivity = policies.find((policy) => policy.fields.kind === "sensitivity");
  return (
    <Stack gap={4}>
      <Notice tone="danger" title="What would leave this browser">
        Connecting a model means the text of a request, and whatever records it carries, is sent to that provider. Confidential sources are excluded from AI retrieval for exactly this reason.
      </Notice>
      <Properties rows={[
        { label: "Residency today", value: String(sensitivity?.fields.residency ?? "This browser only") },
        { label: "Confidential sources", value: "Excluded from AI retrieval by policy" },
        { label: "Your role view", value: context.role },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/brain/permissions`)}>Open knowledge permissions</Button>
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

async function teamRecords(context: ScreenContext, collection: string): Promise<Rec[]> {
  const { db } = await import("@/runtime/db");
  return db.records.where("[organizationId+collection]").equals([context.org.id, collection]).toArray();
}

async function pauseAgent(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const agent = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!agent || agent.collection !== "agents") { context.toast("Choose an AI employee", "Select one on the roster first.", "info"); return; }
  const paused = agent.status === "paused";
  await context.mutate.patch(agent.id, {
    status: paused ? "active" : "paused",
    fields: { ...agent.fields, pausedReason: paused ? "" : `Paused by ${context.actor}.` },
  }, { expectRevision: agent.revision, event: `${agent.title} ${paused ? "resumed" : "paused"} by ${context.actor}` });
  context.toast(paused ? "Resumed" : "Paused", paused ? `${agent.title} is active again.` : `${agent.title} is excluded from tool execution and automatic delegation.`);
}

async function cloneContract(context: ScreenContext): Promise<void> {
  const agents = await teamRecords(context, "agents");
  const evaluations = await teamRecords(context, "evaluations");
  const source = agents.find((agent) => agent.id === context.selectedId) ?? agents[0];
  if (!source) return;
  const run = latestRunFor(evaluations, source.id);
  if (!run || Number(run.fields.score ?? 0) < SAFETY_SCORE) {
    context.toast("Only a tested contract can be cloned", `${source.title} has ${run ? `scored ${String(run.fields.score)}` : "never been evaluated"}, so copying it would spread an untested contract.`, "blocked");
    return;
  }
  const created = await context.mutate.create({
    collection: "agents",
    title: `${source.title} (copy)`,
    status: "draft",
    summary: source.summary,
    fields: { ...source.fields, recordedCostMinor: 0, clonedFrom: source.id },
    body: source.body,
    tags: ["ai"],
  }, `${source.title} cloned as a draft contract`);
  context.toast("Cloned as a draft", `${created.title} is a draft. It must be evaluated on its own before it can be activated.`);
}

async function generateContract(context: ScreenContext): Promise<void> {
  const skills = await teamRecords(context, "skills");
  const draft = useAgentBuilder.getState().draft;
  const set = useAgentBuilder.getState().set;
  const brief = draft.brief.toLowerCase();
  if (!brief.trim()) { context.toast("Write the brief first", "The contract is composed from the words in your brief.", "info"); return; }
  const matched = skills.filter((skill) => {
    const words = `${skill.title} ${skill.summary}`.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 4);
    return skill.fields.trusted !== false && words.some((word) => brief.includes(word));
  });
  const tools = ["workspace.read", ...(/draft|write|prepare|note/.test(brief) ? ["workspace.draft"] : [])];
  set({ skills: matched.map((skill) => skill.id), tools });
  context.toast(
    "Contract composed from your words",
    `${matched.length} skill${matched.length === 1 ? "" : "s"} matched words in the brief and ${tools.length} tools were granted. No model was called: this is a word match against the skill library, and you can change all of it.`,
  );
}

async function runEvaluation(context: ScreenContext): Promise<void> {
  context.setTab("Scenarios");
  context.openOverlay("detailed trace");
  context.toast("Pick a contract to run against", "Open the Test panel on an AI employee profile, or choose a run to inspect its trace.", "info");
}

export const teamApp = registerApp({
  code: "TEAM",
  short: "AI Workforce",
  name: "AI Workforce & Agent Academy",
  purpose: "Contracts for AI employees: what they may read, hold and spend",
  icon: Users,
  nav: [
    { items: [
      { label: "Workforce home", screenId: "ARL-TEAM-001", icon: Users },
      { label: "AI employees", screenId: "ARL-TEAM-002", icon: Bot },
      { label: "Build a contract", screenId: "ARL-TEAM-004", icon: Wrench },
      { label: "Organisation chart", screenId: "ARL-TEAM-005", icon: Network },
    ] },
    { label: "Capability", items: [
      { label: "Skills library", screenId: "ARL-TEAM-006", icon: Wrench },
      { label: "Academy", screenId: "ARL-TEAM-007", icon: GraduationCap },
      { label: "Evaluation lab", screenId: "ARL-TEAM-008", icon: FlaskConical },
    ] },
    { label: "Oversight", items: [
      { label: "Performance", screenId: "ARL-TEAM-009", icon: Gauge },
      { label: "Model routing", screenId: "ARL-TEAM-010", icon: Cpu },
    ] },
  ],
  screens: {
    "ARL-TEAM-001": {
      id: "ARL-TEAM-001",
      title: () => "Workforce home",
      subtitle: (context) => `${context.org.name}'s AI employees are contracts in this browser. None of them is running, because no model provider is connected.`,
      statusStrip: () => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>Model: not connected</Pill>
          <Pill tone="neutral">Provider cost recorded: 0</Pill>
          <span className="ds-subtle">Idle is the honest state, not a placeholder.</span>
        </Row>
      ),
      tabs: (["Overview", "Activity", "Costs", "Reliability"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <WorkforceHome context={context} view={view} />,
      })),
      actions: [
        { id: "Hire AI employee", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/team/agents/new`) },
        { id: "inspect issue", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a contract on the roster"), run: (context) => context.openOverlay("quick profile") },
        { id: "pause agent", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a contract on the roster"), run: (context) => void pauseAgent(context) },
        { id: "view department", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/team/organization`) },
      ],
      overlays: [
        { id: "Agent creation", kind: "modal", title: "Build a contract", width: 520, render: ({ ...context }) => (
          <Stack gap={4}>
            <Notice tone="info" title="A contract is built in six steps">Identity, skills, knowledge, tools, autonomy and a test. It cannot be activated until each one is complete.</Notice>
            <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/team/agents/new`)}>Open the builder</Button>
          </Stack>
        ) },
        { id: "quick profile", kind: "drawer", title: "AI employee", width: 480, render: ({ ...context }) => <QuickProfile context={context} /> },
        { id: "cost inspector", kind: "drawer", title: "Where cost would come from", width: 520, render: ({ ...context }) => <CostInspector context={context} /> },
      ],
    },

    "ARL-TEAM-002": {
      id: "ARL-TEAM-002",
      title: () => "AI employee directory",
      tabs: (["All", "By department", "Active", "Paused", "Draft"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <AgentDirectory context={context} view={view} />,
      })),
      actions: [
        { id: "open profile", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a contract first"), run: (context) => context.navigate(`/o/${context.org.slug}/team/agents/${context.selectedId}`) },
        { id: "Find agent", placement: "secondary", run: () => { document.querySelector<HTMLInputElement>('input[aria-label^="Filter"]')?.focus(); } },
        { id: "assign work", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a contract first"), run: (context) => context.openOverlay("assignment") },
        { id: "clone tested contract", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a contract first"), run: (context) => void cloneContract(context) },
      ],
      overlays: [
        { id: "Agent quick view", kind: "drawer", title: "AI employee", width: 480, render: ({ ...context }) => <QuickProfile context={context} /> },
        { id: "assignment", kind: "modal", title: "Assign work", width: 560, render: ({ close, ...context }) => <AgentAssignment context={context} close={close} /> },
        { id: "archive confirmation", kind: "modal", title: "Archive this contract", tone: "danger", width: 560, render: ({ close, ...context }) => <ArchiveConfirmation context={context} close={close} /> },
      ],
    },

    "ARL-TEAM-003": {
      id: "ARL-TEAM-003",
      title: () => "AI employee",
      tabs: (["Overview", "Skills", "Work", "Permissions", "Performance", "History"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <AgentProfile context={context} view={view} />,
      })),
      actions: [
        { id: "Edit role", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Role edit") },
        { id: "test", placement: "secondary", run: (context) => context.openOverlay("test panel", { id: context.params.id }) },
        { id: "open chat", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/ai/agents/${context.params.id}/chat`) },
        { id: "reassign", placement: "overflow", run: (context) => { context.select(context.params.id); context.openOverlay("permission inspector"); } },
        { id: "pause", placement: "overflow", run: (context) => { context.select(context.params.id); void pauseAgent(context); } },
      ],
      overlays: [
        { id: "Role edit", kind: "modal", title: "Edit the contract", width: 560, render: ({ close, ...context }) => <RoleEdit context={context} close={close} />, footer: submitFooter("role-edit", "Save contract") },
        { id: "permission inspector", kind: "drawer", title: "Permissions", width: 560, render: ({ close, ...context }) => <PermissionInspector context={context} close={close} /> },
        { id: "test panel", kind: "modal", title: "Run an evaluation", width: 680, render: ({ ...context }) => <TestPanel context={context} /> },
      ],
    },

    "ARL-TEAM-004": {
      id: "ARL-TEAM-004",
      title: () => "Agent builder",
      subtitle: () => "Six steps, each validated. Nothing is written to the workspace until the contract is activated.",
      tabs: BUILDER_STEPS.map((step) => ({
        id: step,
        render: (context: ScreenContext) => <AgentBuilder context={context} step={step} />,
      })),
      actions: [
        { id: "activate", placement: "primary", capability: "edit_people", guard: (context) => {
          void context;
          const draft = useAgentBuilder.getState().draft;
          const problems = BUILDER_STEPS.flatMap((step) => builderProblems(draft, step));
          return problems.length === 0 ? undefined : `${problems.length} step${problems.length === 1 ? "" : "s"} are incomplete: ${problems[0]}`;
        }, run: (context) => context.openOverlay("publish confirmation") },
        { id: "Generate contract", placement: "secondary", run: (context) => void generateContract(context) },
        { id: "select templates", placement: "secondary", run: (context) => context.openOverlay("Skill picker") },
        { id: "configure limits", placement: "overflow", run: (context) => context.setTab("Autonomy") },
        { id: "test", placement: "overflow", run: (context) => context.setTab("Test") },
      ],
      overlays: [
        { id: "Skill picker", kind: "drawer", title: "Skills", width: 560, render: ({ ...context }) => <SkillPicker context={context} /> },
        { id: "connector grant", kind: "modal", title: "Granting an external tool", width: 620, render: ({ ...context }) => <ConnectorGrant context={context} /> },
        { id: "simulation", kind: "modal", title: "Evaluation run", width: 680, render: ({ ...context }) => <SimulationOverlay context={context} /> },
        { id: "publish confirmation", kind: "modal", title: "Activate this contract", width: 560, render: ({ close, ...context }) => <PublishConfirmation context={context} close={close} /> },
      ],
    },

    "ARL-TEAM-005": {
      id: "ARL-TEAM-005",
      title: () => "Organisation chart",
      tabs: (["Hierarchy", "Directory", "Capacity"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <TeamOrgChart context={context} view={view} />,
      })),
      actions: [
        { id: "Reparent agent", placement: "primary", capability: "edit_people", guard: (context) => (context.selectedId ? undefined : "Choose a member first"), run: (context) => context.openOverlay("transfer approval") },
        { id: "assign lead", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a member first"), run: (context) => context.openOverlay("hierarchy impact") },
        { id: "create department", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/hq/departments`) },
        { id: "filter", placement: "overflow", run: (context) => context.setTab("Directory") },
      ],
      overlays: [
        { id: "Employee inspector", kind: "drawer", title: "Member", width: 480, render: ({ ...context }) => <EmployeeInspector context={context} /> },
        { id: "transfer approval", kind: "modal", title: "Transfer", width: 560, render: ({ close, ...context }) => <TransferApproval context={context} close={close} /> },
        { id: "hierarchy impact", kind: "modal", title: "What this line carries", width: 560, render: ({ ...context }) => <HierarchyImpact context={context} /> },
      ],
    },

    "ARL-TEAM-006": {
      id: "ARL-TEAM-006",
      title: () => "Skills library",
      tabs: (["Native", "Organization", "Purchased", "Draft"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <SkillsLibrary context={context} view={view} />,
      })),
      actions: [
        { id: "install", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose a skill first"), run: (context) => context.openOverlay("install permission") },
        { id: "Search", placement: "secondary", run: () => { document.querySelector<HTMLInputElement>('input[aria-label^="Filter"]')?.focus(); } },
        { id: "edit", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a skill first"), run: (context) => context.openOverlay("Skill detail") },
        { id: "compare versions", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a skill first"), run: (context) => context.openOverlay("compatibility test") },
        { id: "deprecate", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Choose a skill first"), run: (context) => void deprecateSkill(context) },
      ],
      overlays: [
        { id: "Skill detail", kind: "drawer", title: "Skill", width: 520, render: ({ ...context }) => <SkillDetail context={context} /> },
        { id: "install permission", kind: "modal", title: "Install on a contract", width: 560, render: ({ close, ...context }) => <InstallPermission context={context} close={close} /> },
        { id: "compatibility test", kind: "modal", title: "Which contracts could run it", width: 620, render: ({ ...context }) => <CompatibilityTest context={context} /> },
      ],
    },

    "ARL-TEAM-007": {
      id: "ARL-TEAM-007",
      title: () => "Agent academy",
      tabs: (["Training", "Playbooks", "Assessments", "Results"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <Academy context={context} view={view} />,
      })),
      actions: [
        { id: "Upload SOP", placement: "primary", run: (context) => context.openOverlay("Training asset upload") },
        { id: "demonstrate task", placement: "secondary", run: (context) => context.openOverlay("Training asset upload", { mode: "demonstration" }) },
        { id: "assign course", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a course first"), run: (context) => context.openOverlay("assessment builder") },
        { id: "test", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/team/evaluations`) },
      ],
      overlays: [
        { id: "Training asset upload", kind: "modal", title: "Record a procedure", width: 620, render: ({ close, ...context }) => <TrainingAssetUpload context={context} close={close} />, footer: submitFooter("training-upload", "Record") },
        { id: "assessment builder", kind: "modal", title: "Assessment", width: 560, render: ({ close, ...context }) => <AssessmentBuilder context={context} close={close} /> },
        { id: "publishing review", kind: "modal", title: "Publish with a scope", width: 560, render: ({ close, ...context }) => <PublishingReview context={context} close={close} /> },
      ],
    },

    "ARL-TEAM-008": {
      id: "ARL-TEAM-008",
      title: () => "Evaluation lab",
      subtitle: () => `Runs are real local checks of a contract against this workspace. The safety line is ${SAFETY_SCORE}.`,
      tabs: (["Scenarios", "Runs", "Regression", "Reports"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <EvaluationLab context={context} view={view} />,
      })),
      actions: [
        { id: "Run evaluation", placement: "primary", run: (context) => context.openOverlay("Scenario editor", { run: true }) },
        { id: "approve new version", placement: "secondary", capability: "edit_people", run: (context) => context.openOverlay("promotion approval") },
        { id: "compare model", placement: "secondary", guard: () => "No model provider is connected, so there is nothing to compare.", run: () => undefined },
        { id: "rollback", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a run first"), run: (context) => void runEvaluation(context) },
      ],
      overlays: [
        { id: "Scenario editor", kind: "modal", title: "Scenario", width: 620, render: ({ close, ...context }) => <ScenarioEditor context={context} close={close} />, footer: submitFooter("scenario-editor", "Save scenario") },
        { id: "detailed trace", kind: "drawer", title: "Run trace", width: 560, render: ({ ...context }) => <DetailedTrace context={context} /> },
        { id: "promotion approval", kind: "modal", title: "Promote a version", width: 560, render: ({ close, ...context }) => <PromotionApproval context={context} close={close} /> },
      ],
    },

    "ARL-TEAM-009": {
      id: "ARL-TEAM-009",
      title: () => "Agent performance",
      tabs: (["Employees", "Departments", "Trends", "Quality"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <AgentPerformance context={context} view={view} />,
      })),
      actions: [
        { id: "Compare agents", placement: "primary", run: (context) => context.setTab("Departments") },
        { id: "inspect failed task", placement: "secondary", run: (context) => context.setTab("Quality") },
        { id: "coach", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose an AI employee first"), run: (context) => context.openOverlay("performance note") },
        { id: "adjust resource policy", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/team/models`) },
      ],
      overlays: [
        { id: "Metric definition", kind: "modal", title: "How each figure is counted", width: 560, render: () => <MetricDefinition /> },
        { id: "incident trace", kind: "drawer", title: "Failed run", width: 560, render: ({ ...context }) => <DetailedTrace context={context} /> },
        { id: "performance note", kind: "modal", title: "Coaching note", width: 560, render: ({ close, ...context }) => <PerformanceNote context={context} close={close} />, footer: submitFooter("performance-note", "Record note") },
      ],
    },

    "ARL-TEAM-010": {
      id: "ARL-TEAM-010",
      title: () => "Model routing",
      subtitle: () => "Every provider is listed as unconnected. A route here is a recorded preference, not a path a request can take.",
      tabs: (["Providers", "Routing", "Budgets", "Experiments"] as const).map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ModelRouting context={context} view={view} />,
      })),
      actions: [
        { id: "Set role model", placement: "primary", capability: "manage_connectors", run: (context) => context.openOverlay("Provider setup") },
        { id: "test fallback", placement: "secondary", run: (context) => context.openOverlay("routing simulator") },
        { id: "restrict data", placement: "secondary", run: (context) => context.openOverlay("policy warning") },
        { id: "inspect spend", placement: "overflow", run: (context) => context.setTab("Budgets") },
      ],
      overlays: [
        { id: "Provider setup", kind: "modal", title: "What connecting would need", width: 560, render: ({ ...context }) => <ProviderSetup context={context} /> },
        { id: "routing simulator", kind: "drawer", title: "Routing simulation", width: 620, render: ({ ...context }) => <RoutingSimulator context={context} /> },
        { id: "policy warning", kind: "modal", title: "What would leave this browser", tone: "danger", width: 560, render: ({ ...context }) => <PolicyWarning context={context} /> },
      ],
    },
  },
});

async function deprecateSkill(context: ScreenContext): Promise<void> {
  const { db } = await import("@/runtime/db");
  const skill = context.selectedId ? await db.records.get(context.selectedId) : undefined;
  if (!skill || skill.collection !== "skills") return;
  const agents = await teamRecords(context, "agents");
  const users = agents.filter((agent) => ((agent.body as { skills?: string[] } | undefined)?.skills ?? []).includes(skill.id));
  if (users.length > 0) {
    context.toast("In use", `${users.map((agent) => agent.title).join(", ")} hold ${skill.title}. Remove it from them before deprecating it.`, "blocked");
    return;
  }
  await context.mutate.patch(skill.id, { status: "deprecated", fields: { ...skill.fields, deprecatedBy: context.actor } }, { expectRevision: skill.revision, event: `${skill.title} deprecated by ${context.actor}` });
  context.toast("Deprecated", "It stays in the library marked deprecated and is not offered to a contract.");
}
