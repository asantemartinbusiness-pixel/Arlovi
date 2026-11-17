import { useMemo, useState } from "react";
import { Activity, CalendarRange, FolderKanban, LayoutDashboard, ListChecks, Timer, Users } from "lucide-react";
import {
  Avatar, BarChart, Button, Card, Checkbox, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice,
  Pill, Properties, Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useRecord, useWorkspace } from "@/platform/workspace";
import { addDays, clockIso, daysBetween, startOfWeek } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { LANES, TaskBoard, stageOf, type LaneId } from "./board";
import { taskMoveDecision } from "./progression";
import { filesForProject } from "./files";
import { BoardFilterNotice, PortfolioFilterNotice, TaskComments, boardFilter, matchesBoard, matchesPortfolio, pinnedBy, portfolioFilter } from "./actions";
import { Gantt, createsCycle, criticalPath, dependenciesOf } from "./timeline";
import { OpsHeader, OpsMetric, OpsMetrics } from "@/applications/shared/operational-surfaces";
import { planTimesheetApprovals } from "@/applications/hr/workforce";

export function useProjectData() {
  return useCollections(["projects", "tasks", "templates", "objectives", "shifts", "members", "departments", "documents"]);
}

const HEALTH_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  on_track: "success", at_risk: "warning", off_track: "danger",
};

function healthLabel(value: unknown): string {
  return String(value ?? "unknown").replace("_", " ");
}

/** Tasks that belong to a project, excluding checklist items from other apps. */
function tasksOf(tasks: Rec[], projectId: string): Rec[] {
  return tasks.filter((task) => task.parentId === projectId && task.fields.kind !== "onboarding");
}

function progressOf(tasks: Rec[]): number {
  if (tasks.length === 0) return 0;
  return Math.round((tasks.filter((task) => stageOf(task) === "done").length / tasks.length) * 100);
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-001 · Portfolio
 * ------------------------------------------------------------------ */

export function Portfolio({ context, lens }: { context: ScreenContext; lens: "Overview" | "Departments" | "Timeline" | "Risks" }) {
  const raw = useProjectData();
  const filter = portfolioFilter.use();
  const shown = raw.projects.filter((project) => matchesPortfolio(project, filter));
  return (
    <Stack gap={4}>
      <PortfolioFilterNotice total={raw.projects.length} shown={shown.length} />
      <PortfolioBody context={context} lens={lens} />
    </Stack>
  );
}

function PortfolioBody({ context, lens }: { context: ScreenContext; lens: "Overview" | "Departments" | "Timeline" | "Risks" }) {
  const raw = useProjectData();
  const filter = portfolioFilter.use();
  const data: typeof raw = { ...raw, projects: raw.projects.filter((project) => matchesPortfolio(project, filter)) };
  const { org, now } = useWorkspace();
  const live = data.projects.filter((project) => project.status !== "done");
  const budget = data.projects.reduce((sum, project) => sum + Number(project.fields.budgetMinor ?? 0), 0);
  const spent = data.projects.reduce((sum, project) => sum + Number(project.fields.spentMinor ?? 0), 0);

  if (lens === "Departments") {
    return (
      <Grid>
        {data.departments.map((department) => {
          const projects = data.projects.filter((project) => project.fields.departmentId === department.id);
          const tasks = projects.flatMap((project) => tasksOf(data.tasks, project.id));
          return (
            <Card key={department.id} span={6} eyebrow="DEPARTMENT" prov="human" title={department.title} subtitle={`${projects.length} projects · ${tasks.length} tasks`}>
              <Stack gap={3}>
                {projects.map((project) => (
                  <Row key={project.id} gap={3}>
                    <span className="ds-grow ds-truncate">{project.title}</span>
                    <Pill tone={HEALTH_TONE[String(project.fields.health)] ?? "neutral"} dot>{healthLabel(project.fields.health)}</Pill>
                    <span className="ds-num ds-subtle" style={{ width: 48, textAlign: "end" }}>{progressOf(tasksOf(data.tasks, project.id))}%</span>
                  </Row>
                ))}
                {projects.length === 0 && <span className="ds-subtle">No projects in this department.</span>}
              </Stack>
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Timeline") {
    const spans = data.projects.map((project) => ({ ...project }));
    return (
      <Stack gap={4}>
        <Gantt
          context={context}
          tasks={spans}
          onPick={(project) => context.navigate(`/o/${org.slug}/project/projects/${project.id}`)}
        />
        <Notice tone="info" title="One bar per project">
          Each bar is a project's own start and end, not a sum of its tasks. Rollups never add a task twice because a task belongs to exactly one project.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Risks") {
    const rows = data.projects
      .filter((project) => project.fields.health !== "on_track" || Number(project.fields.spentMinor ?? 0) > Number(project.fields.budgetMinor ?? 0))
      .map((project) => {
        const tasks = tasksOf(data.tasks, project.id);
        const blocked = tasks.filter((task) => stageOf(task) === "blocked");
        const over = Number(project.fields.spentMinor ?? 0) > Number(project.fields.budgetMinor ?? 0);
        const late = tasks.filter((task) => task.endAt && new Date(task.endAt) < now && stageOf(task) !== "done");
        return {
          id: project.id,
          project: project.title,
          health: String(project.fields.health ?? ""),
          issue: [
            blocked.length ? `${blocked.length} blocked` : "",
            over ? "over budget" : "",
            late.length ? `${late.length} past its date` : "",
          ].filter(Boolean).join(" · ") || "Flagged by its owner",
        };
      });
    return rows.length === 0 ? <Empty title="Nothing is flagged" icon={<Activity size={20} />} /> : (
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Portfolio risks"
        rowTone={(row) => (row.health === "off_track" ? "danger" : "warning")}
        columns={[
          { key: "project", header: "Project", primary: true, cell: (row) => row.project, sortValue: (row) => row.project, filterValue: (row) => row.project },
          { key: "health", header: "Health", cell: (row) => <Pill tone={HEALTH_TONE[row.health] ?? "neutral"} dot>{healthLabel(row.health)}</Pill> },
          { key: "issue", header: "Why", cell: (row) => row.issue },
        ]}
        onOpen={(id) => context.navigate(`/o/${org.slug}/project/projects/${id}`)}
      />
    );
  }

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Live projects" value={String(live.length)} prov="human" meta={`${data.projects.length} including closed`} onClick={() => context.navigate(`/o/${org.slug}/project/projects`)} />
        <Stat label="Committed budget" value={context.money(budget)} prov="posted" meta="From the project records" />
        <Stat label="Spent" value={context.money(spent)} prov="posted" meta={`${Math.round((spent / Math.max(1, budget)) * 100)}% of budget`} onClick={() => context.openOverlay("initiative detail")} />
        <Stat label="Off track" value={String(data.projects.filter((project) => project.fields.health === "off_track").length)} prov="human" meta="Owner-set health" onClick={() => context.setTab("Risks")} />
      </StatRow>

      <Grid>
        {[...new Set(data.projects.map((project) => String(project.fields.programme ?? "Unassigned")))].map((programme) => {
          const projects = data.projects.filter((project) => String(project.fields.programme ?? "Unassigned") === programme);
          return (
            <Card key={programme} span={6} eyebrow="PROGRAMME" prov="human" title={programme} subtitle={`${projects.length} projects`} actions={<Pill>{projects.filter((project) => project.status !== "done").length} live</Pill>}>
              <Stack gap={3}>
                {projects.map((project) => {
                  const tasks = tasksOf(data.tasks, project.id);
                  const spentOnProject = Number(project.fields.spentMinor ?? 0);
                  const budgetOnProject = Number(project.fields.budgetMinor ?? 0);
                  return (
                    <div key={project.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                      <Row gap={2}>
                        <button type="button" className="ds-grow" style={{ textAlign: "start", font: "inherit", fontWeight: 600, background: "none", border: 0, cursor: "pointer", color: "inherit" }} onClick={() => context.navigate(`/o/${org.slug}/project/projects/${project.id}`)}>
                          {project.title}
                        </button>
                        <Pill tone={HEALTH_TONE[String(project.fields.health)] ?? "neutral"} dot>{healthLabel(project.fields.health)}</Pill>
                      </Row>
                      <p className="ds-subtle" style={{ marginBlock: 4 }}>{project.summary}</p>
                      <Meter value={progressOf(tasks)} max={100} label={`${project.title} progress`} tone={project.fields.health === "off_track" ? "danger" : project.fields.health === "at_risk" ? "warning" : "success"} />
                      <Row gap={2} style={{ marginBlockStart: 6 }}>
                        <span className="ds-subtle ds-grow"><span className="ds-num">{tasks.filter((task) => stageOf(task) === "done").length} of {tasks.length}</span> tasks done</span>
                        <span className="ds-subtle ds-num">{context.money(spentOnProject)} / {context.money(budgetOnProject)}</span>
                      </Row>
                    </div>
                  );
                })}
              </Stack>
            </Card>
          );
        })}
        <Card span={12} eyebrow="CAPACITY" prov="human" title="Capacity across teams" subtitle="Assigned open tasks per person">
          <BarChart
            title="Open tasks by assignee"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{
              name: "Open tasks",
              points: [...new Set(data.tasks.filter((task) => task.fields.kind !== "onboarding").map((task) => String(task.fields.assignee ?? task.ownerName)))]
                .map((person) => ({ label: person.split(" ")[0], value: data.tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === person && stageOf(task) !== "done").length }))
                .filter((point) => point.value > 0),
            }]}
            footer="Counted once per task. A task linked into two projects would still be one row in this workspace."
          />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-002 · Project Directory
 * ------------------------------------------------------------------ */

export function ProjectDirectory({ context, lens }: { context: ScreenContext; lens: "All" | "Mine" | "Following" | "Archived" }) {
  const data = useProjectData();
  const { org, actor } = useWorkspace();
  const rows = lens === "Mine"
    ? data.projects.filter((project) => project.ownerName === actor || String(project.fields.owner ?? "") === actor)
    : lens === "Following"
      ? data.projects.filter((project) => pinnedBy(project).includes(actor))
      : lens === "Archived"
        ? data.projects.filter((project) => project.status === "done" || project.status === "archived")
        : data.projects.filter((project) => project.status !== "archived");

  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} projects`} icon={<FolderKanban size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Project template")}>Create a project</Button>}>
      {lens === "Following" ? `Projects ${actor} pins appear here. Select a project and use Pin or unpin.` : "Create a project from a template or from scratch."}
    </Empty>
  ) : (
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label={`${lens} projects`}
      selectedId={context.selectedId}
      columns={[
        { key: "title", header: "Project", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.programme ?? "")}` },
        { key: "owner", header: "Owner", cell: (row) => <Row gap={2}><Avatar name={row.ownerName} size="sm" />{row.ownerName}</Row>, sortValue: (row) => row.ownerName, hideBelow: 900 },
        { key: "progress", header: "Progress", cell: (row) => {
          const tasks = tasksOf(data.tasks, row.id);
          return <Row gap={2}><div style={{ width: 90 }}><Meter value={progressOf(tasks)} max={100} label={`${row.title} progress`} /></div><span className="ds-subtle ds-num">{progressOf(tasks)}%</span></Row>;
        }, sortValue: (row) => progressOf(tasksOf(data.tasks, row.id)) },
        { key: "health", header: "Health", cell: (row) => <Pill tone={HEALTH_TONE[String(row.fields.health)] ?? "neutral"} dot>{healthLabel(row.fields.health)}</Pill>, sortValue: (row) => String(row.fields.health ?? "") },
        { key: "priority", header: "Priority", cell: (row) => String(row.fields.priority ?? "normal"), hideBelow: 1200 },
        { key: "updated", header: "Last activity", align: "end", cell: (row) => context.relative(row.updatedAt), sortValue: (row) => row.updatedAt },
      ]}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/project/projects/${id}`)}
      bulkActions={[
        { label: "Archive", tone: "danger", onRun: (selected) => selected.forEach((project) => { void context.mutate.patch(project.id, { status: "archived" }, { event: `${project.title} archived` }); }) },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-003 · Project Overview
 * ------------------------------------------------------------------ */

export function ProjectOverview({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProjectData();
  const record = useRecord(context.params.id);
  const { org, now } = useWorkspace();
  // A stale/wrong-company detail URL must never display the first project.
  const project = context.params.id
    ? (record?.collection === "projects" && record.organizationId === org.id ? record : undefined)
    : data.projects[0];
  const events = useCollections(["tasks"]);
  if (!project) return <Empty title="No project" icon={<FolderKanban size={20} />} />;
  const tasks = tasksOf(data.tasks, project.id);
  const milestones = tasks.filter((task) => task.fields.kind === "milestone");
  const time = data.shifts.filter((entry) => entry.fields.kind === "time" && entry.fields.projectId === project.id);

  if (lens === "Tasks") {
    return (
      <TaskBoard
        context={context}
        tasks={tasks}
        onMove={async (task, lane) => {
          const decision = taskMoveDecision(task, lane, tasks);
          if (decision.blocked) {
            context.toast("Task not moved", decision.blocked, "blocked");
            return false;
          }
          if (decision.needsReviewDecision) {
            context.select(task.id);
            context.openOverlay("stage rule", { id: task.id, lane });
            return false;
          }
          const saved = await context.mutate.patch(task.id, {
            status: lane, fields: { ...task.fields, stage: lane },
          }, { expectRevision: task.revision, event: `${task.title} moved to ${lane}` });
          return Boolean(saved);
        }}
        onOpen={(task) => context.navigate(`/o/${org.slug}/project/tasks/${task.id}`)}
      />
    );
  }

  if (lens === "Timeline") {
    return <Gantt context={context} tasks={tasks} showBaseline onPick={(task) => context.navigate(`/o/${org.slug}/project/tasks/${task.id}`)} />;
  }

  if (lens === "Files") {
    const files = filesForProject(project, data.documents);
    return files.length === 0 ? (
      <Empty title="No files attached" icon={<FolderKanban size={20} />} action={<Button variant="secondary" onClick={() => context.openOverlay("attach file")}>Attach a file</Button>}>
        A file here is a record of a document: its name, who attached it and when. No storage provider is connected.
      </Empty>
    ) : (
      <DataGrid
        rows={files}
        rowId={(row) => row.id}
        label="Project files"
        columns={[
          { key: "title", header: "File", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
          { key: "updated", header: "Updated", align: "end", cell: (row) => context.date(row.updatedAt), sortValue: (row) => row.updatedAt },
        ]}
      />
    );
  }

  if (lens === "Activity") {
    const recent = [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
    return (
      <ol className="ds-stack ds-gap-3">
        {recent.map((task) => (
          <li key={task.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <Row gap={2}>
              <strong className="ds-grow">{task.title}</strong>
              <Pill tone={stageOf(task) === "done" ? "success" : "neutral"}>{stageOf(task)}</Pill>
              <span className="ds-subtle">{context.relative(task.updatedAt)}</span>
            </Row>
            <p className="ds-subtle">{task.summary}</p>
          </li>
        ))}
        {recent.length === 0 && <Empty title="No activity" />}
      </ol>
    );
  }

  if (lens === "Metrics") {
    const estimate = tasks.reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0);
    const logged = tasks.reduce((sum, task) => sum + Number(task.fields.loggedHours ?? 0), 0);
    return (
      <Grid>
        <Card span={6} eyebrow="EFFORT" prov="human" title="Hours" subtitle="Estimated against logged">
          <BarChart
            title="Estimated and logged hours by stage"
            height={200}
            format={(value) => `${Math.round(value)}h`}
            series={[
              { name: "Estimated", points: LANES.map((lane) => ({ label: lane.label, value: tasks.filter((task) => stageOf(task) === lane.id).reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0) })) },
              { name: "Logged", points: LANES.map((lane) => ({ label: lane.label, value: tasks.filter((task) => stageOf(task) === lane.id).reduce((sum, task) => sum + Number(task.fields.loggedHours ?? 0), 0) })) },
            ]}
            footer={`${logged} of ${estimate} estimated hours logged. Logged hours come from time entries, not from the estimate.`}
          />
        </Card>
        <Card span={6} eyebrow="WORK" prov="human" title="Work by stage">
          <DonutChart title="Tasks by stage" size={150} points={LANES.map((lane) => ({ label: lane.label, value: tasks.filter((task) => stageOf(task) === lane.id).length })).filter((point) => point.value > 0)} />
        </Card>
        <Card span={12} eyebrow="BUDGET" prov="posted" title="Budget">
          <Stack gap={3}>
            <Meter value={Number(project.fields.spentMinor ?? 0)} max={Math.max(1, Number(project.fields.budgetMinor ?? 0))} label="Budget used" tone={Number(project.fields.spentMinor ?? 0) > Number(project.fields.budgetMinor ?? 0) ? "danger" : undefined} />
            <Properties rows={[
              { label: "Budget", value: context.money(Number(project.fields.budgetMinor ?? 0)) },
              { label: "Committed", value: context.money(Number(project.fields.spentMinor ?? 0)) },
              { label: "Time logged against this project", value: `${time.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0)} hours` },
            ]} />
          </Stack>
        </Card>
      </Grid>
    );
  }

  const late = tasks.filter((task) => task.endAt && new Date(task.endAt) < now && stageOf(task) !== "done");
  return (
    <Grid>
      <Card span={7} eyebrow="PROJECT" prov="human" title={project.title} subtitle={project.summary} actions={<Pill tone={HEALTH_TONE[String(project.fields.health)] ?? "neutral"} dot>{healthLabel(project.fields.health)}</Pill>}>
        <Stack gap={3}>
          <Properties rows={[
            { label: "Owner", value: project.ownerName },
            { label: "Programme", value: String(project.fields.programme ?? "—") },
            { label: "Runs", value: <span className="ds-num">{context.date(project.startAt)} – {context.date(project.endAt)}</span> },
            { label: "Priority", value: String(project.fields.priority ?? "normal") },
            { label: "Status", value: project.status },
          ]} />
          <Meter value={progressOf(tasks)} max={100} label="Project progress" tone={project.fields.health === "off_track" ? "danger" : undefined} />
          {project.fields.automationPaused === true && (
            <Notice tone="warning" title="Automation is paused for this project">
              Configured automation on this project is stopped. Tasks, time entries and anything belonging to other projects
              keep running: pausing one project never pauses the workspace.
            </Notice>
          )}
        </Stack>
      </Card>
      <Card span={5} eyebrow="PLAN" prov="human" title="Milestones" subtitle={`${milestones.length} on the plan`}>
        {milestones.length === 0 ? <Empty title="No milestones" icon={<CalendarRange size={20} />} /> : (
          <Stack gap={2}>
            {milestones.map((milestone) => (
              <Row key={milestone.id} gap={2}>
                <span className="ds-grow ds-truncate">{milestone.title}</span>
                <Pill tone={stageOf(milestone) === "done" ? "success" : milestone.endAt && new Date(milestone.endAt) < now ? "danger" : "neutral"}>{context.date(milestone.endAt, { day: "numeric", month: "short" })}</Pill>
              </Row>
            ))}
          </Stack>
        )}
        <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.openOverlay("Milestone editor")}>Add a milestone</Button>
      </Card>
      <Card span={4} eyebrow="PEOPLE" prov="human" title="Team" subtitle={`${[...new Set(tasks.map((task) => String(task.fields.assignee ?? task.ownerName)))].length} people with work`}>
        <Stack gap={2}>
          {[...new Set(tasks.map((task) => String(task.fields.assignee ?? task.ownerName)))].map((person) => (
            <Row key={person} gap={2}>
              <Avatar name={person} size="sm" />
              <span className="ds-grow ds-truncate">{person}</span>
              <span className="ds-subtle ds-num">{tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === person && stageOf(task) !== "done").length} open</span>
            </Row>
          ))}
        </Stack>
      </Card>
      <Card span={4} eyebrow="BUDGET" prov="posted" title="Budget" subtitle={`${Math.round((Number(project.fields.spentMinor ?? 0) / Math.max(1, Number(project.fields.budgetMinor ?? 0))) * 100)}% committed`}>
        <Stack gap={2}>
          <Meter value={Number(project.fields.spentMinor ?? 0)} max={Math.max(1, Number(project.fields.budgetMinor ?? 0))} label="Budget used" tone={Number(project.fields.spentMinor ?? 0) > Number(project.fields.budgetMinor ?? 0) ? "danger" : undefined} />
          <span className="ds-subtle">{context.money(Number(project.fields.spentMinor ?? 0))} of {context.money(Number(project.fields.budgetMinor ?? 0))}</span>
        </Stack>
      </Card>
      <Card span={4} eyebrow="BLOCKERS" prov="human" title="Decisions and blockers" subtitle={`${late.length} past their date`}>
        <Stack gap={2}>
          {tasks.filter((task) => stageOf(task) === "blocked").map((task) => (
            <Row key={task.id} gap={2}><Pill tone="danger">Blocked</Pill><span className="ds-grow ds-truncate">{task.title}</span></Row>
          ))}
          {late.slice(0, 3).map((task) => (
            <Row key={task.id} gap={2}><Pill tone="warning">Late</Pill><span className="ds-grow ds-truncate">{task.title}</span></Row>
          ))}
          {tasks.filter((task) => stageOf(task) === "blocked").length === 0 && late.length === 0 && <span className="ds-subtle">Nothing is blocked and nothing is late.</span>}
        </Stack>
      </Card>
      <Card span={12} title="Progress is counted, not estimated">
        <Notice tone="info">
          {progressOf(tasks)}% is the share of this project's {tasks.length} tasks in the Done lane, and {events.tasks.length > 0 ? "" : ""}
          nothing else. A blocker is a task in the Blocked lane. Neither figure is a judgement.
        </Notice>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-004 · Task Board
 * ------------------------------------------------------------------ */

export function BoardScreen({ context, lens }: { context: ScreenContext; lens: "Board" | "List" | "By owner" | "By sprint" }) {
  const data = useProjectData();
  const boardFilterValue = boardFilter.use();
  const record = useRecord(context.params.id);
  const { org } = useWorkspace();
  const project = context.params.id
    ? (record?.collection === "projects" && record.organizationId === org.id ? record : undefined)
    : data.projects[0];
  if (!project) return <Empty title="No project" />;
  const allTasks = tasksOf(data.tasks, project.id);
  const tasks = allTasks.filter((task) => matchesBoard(task, boardFilterValue));

  async function moveTask(task: Rec, lane: LaneId): Promise<boolean> {
    const decision = taskMoveDecision(task, lane, allTasks);
    if (decision.blocked) {
      context.toast("Task not moved", decision.blocked, "blocked");
      return false;
    }
    if (decision.needsReviewDecision) {
      context.select(task.id);
      context.openOverlay("stage rule", { id: task.id, lane });
      return false;
    }
    const saved = await context.mutate.patch(task.id, {
      status: lane, fields: { ...task.fields, stage: lane },
    }, { expectRevision: task.revision, event: `${task.title} moved to ${lane}` });
    return Boolean(saved);
  }

  if (lens === "List") {
    return (
      <DataGrid
        rows={tasks}
        rowId={(row) => row.id}
        label={`${project.title} tasks`}
        selectedId={context.selectedId}
        columns={[
          { key: "title", header: "Task", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary} ${String(row.fields.assignee ?? "")}` },
          { key: "stage", header: "Stage", cell: (row) => <Pill tone={stageOf(row) === "done" ? "success" : stageOf(row) === "blocked" ? "danger" : "neutral"}>{stageOf(row)}</Pill>, sortValue: (row) => stageOf(row) },
          { key: "assignee", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName), hideBelow: 900 },
          { key: "sprint", header: "Sprint", cell: (row) => String(row.fields.sprint ?? "—"), hideBelow: 1100 },
          { key: "due", header: "Due", align: "end", cell: (row) => context.date(row.dueAt), sortValue: (row) => row.dueAt ?? "~" },
        ]}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.navigate(`/o/${org.slug}/project/tasks/${id}`)}
        bulkActions={[
          { label: "Move to Review", onRun: () => context.openOverlay("batch action review") },
          { label: "Assign to me", onRun: (rows) => rows.forEach((row) => { void context.mutate.patch(row.id, { fields: { ...row.fields, assignee: context.actor } }, { event: `${row.title} assigned to ${context.actor}` }); }) },
        ]}
      />
    );
  }

  if (lens === "By owner") {
    const owners = [...new Set(tasks.map((task) => String(task.fields.assignee ?? task.ownerName)))];
    return (
      <Grid>
        {owners.map((owner) => (
          <Card key={owner} span={4} title={<Row gap={2}><Avatar name={owner} size="sm" />{owner}</Row>} subtitle={`${tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === owner && stageOf(task) !== "done").length} open`}>
            <Stack gap={2}>
              {tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === owner).map((task) => (
                <button key={task.id} type="button" className="ds-record-card" onClick={() => context.navigate(`/o/${org.slug}/project/tasks/${task.id}`)}>
                  <Row gap={2}><span className="ds-grow" style={{ textAlign: "start" }}>{task.title}</span><Pill tone={stageOf(task) === "done" ? "success" : "neutral"}>{stageOf(task)}</Pill></Row>
                </button>
              ))}
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  if (lens === "By sprint") {
    const sprints = [...new Set(tasks.map((task) => String(task.fields.sprint ?? "Unscheduled")))].sort();
    return (
      <Stack gap={4}>
        {sprints.map((sprint) => {
          const inSprint = tasks.filter((task) => String(task.fields.sprint ?? "Unscheduled") === sprint);
          return (
            <Card key={sprint} title={sprint} subtitle={`${inSprint.length} tasks · ${inSprint.reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0)} estimated hours`}
              actions={<Pill tone={inSprint.every((task) => stageOf(task) === "done") ? "success" : "neutral"}>{inSprint.filter((task) => stageOf(task) === "done").length} done</Pill>}>
              <Stack gap={2}>
                {inSprint.map((task) => (
                  <Row key={task.id} gap={2}>
                    <span className="ds-grow ds-truncate">{task.title}</span>
                    <span className="ds-subtle">{String(task.fields.assignee ?? "")}</span>
                    <Pill tone={stageOf(task) === "done" ? "success" : stageOf(task) === "blocked" ? "danger" : "neutral"}>{stageOf(task)}</Pill>
                  </Row>
                ))}
              </Stack>
            </Card>
          );
        })}
      </Stack>
    );
  }

  return (
    <Stack gap={3}>
      <BoardFilterNotice total={allTasks.length} shown={tasks.length} />
      <TaskBoard
        context={context}
        tasks={tasks}
        onMove={moveTask}
        onOpen={(task) => { context.select(task.id); context.openOverlay("Task drawer", { id: task.id }); }}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-005 · Task Detail
 * ------------------------------------------------------------------ */

interface ChecklistItem { label: string; done: boolean }

function checklistOf(task: Rec): ChecklistItem[] {
  const body = task.body as { checklist?: ChecklistItem[] } | undefined;
  return body?.checklist ?? [];
}

export function TaskDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useProjectData();
  const record = useRecord(context.params.id);
  const { org } = useWorkspace();
  const task = context.params.id
    ? (record?.collection === "tasks" && record.organizationId === org.id ? record : undefined)
    : data.tasks[0];
  const [comment, setComment] = useState("");
  if (!task) return <Empty title="No task" icon={<ListChecks size={20} />} />;
  const project = data.projects.find((row) => row.id === task.parentId);
  const dependencies = dependenciesOf(task).map((id) => data.tasks.find((row) => row.id === id)).filter((row): row is Rec => Boolean(row));
  const dependents = data.tasks.filter((row) => dependenciesOf(row).includes(task.id));
  const time = data.shifts.filter((entry) => entry.fields.kind === "time" && entry.fields.taskId === task.id);
  const checklist = checklistOf(task);

  if (lens === "Discussion") {
    return (
      <Stack gap={4}>
        <Card title="Comments" subtitle="Written against this task, each with its author">
          <TaskComments context={context} taskId={task.id} />
        </Card>
        <form
          className="ds-stack ds-gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!comment.trim()) return;
            await context.mutate.log(`${context.actor} on ${task.title}: ${comment.trim()}`, { entityId: task.id, type: "comment" });
            context.toast("Comment recorded", "It is in the task's activity, attributed to you.");
            setComment("");
          }}
        >
          <Field label="Add a comment"><TextArea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} /></Field>
          <Row gap={2}><Button type="submit" variant="primary" disabled={!comment.trim()}>Comment</Button></Row>
        </form>
      </Stack>
    );
  }

  if (lens === "Subtasks") {
    return (
      <Stack gap={4}>
        <Card title="Checklist" subtitle={`${checklist.filter((item) => item.done).length} of ${checklist.length} done`}>
          <Stack gap={2}>
            {checklist.length === 0 && <span className="ds-subtle">No checklist on this task.</span>}
            {checklist.map((item, index) => (
              <Checkbox
                key={item.label}
                label={item.label}
                checked={item.done}
                onChange={async (event) => {
                  const next = checklist.map((entry, position) => (position === index ? { ...entry, done: event.target.checked } : entry));
                  await context.mutate.patch(task.id, { body: { ...(task.body as object ?? {}), checklist: next } }, { expectRevision: task.revision, event: `Checklist item ${event.target.checked ? "ticked" : "unticked"} on ${task.title}` });
                }}
              />
            ))}
          </Stack>
        </Card>
        <Card title="Time logged" subtitle={`${time.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0)} hours against this task`}>
          {time.length === 0 ? <span className="ds-subtle">No time has been logged.</span> : (
            <Stack gap={2}>
              {time.map((entry) => (
                <Row key={entry.id} gap={2}>
                  <span className="ds-grow">{String(entry.fields.employeeName ?? entry.ownerName)}</span>
                  <span className="ds-subtle">{context.date(entry.startAt)}</span>
                  <strong className="ds-num">{String(entry.fields.hours ?? 0)}h</strong>
                  <Pill tone={entry.fields.approved === true ? "success" : "warning"}>{entry.fields.approved === true ? "approved" : "submitted"}</Pill>
                </Row>
              ))}
            </Stack>
          )}
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-3)" }} onClick={() => context.navigate(`/o/${org.slug}/project/time`)}>Log time</Button>
        </Card>
      </Stack>
    );
  }

  if (lens === "History") {
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Created", value: `${context.dateTime(task.createdAt)} by ${task.createdBy}` },
          { label: "Last change", value: `${context.dateTime(task.updatedAt)} by ${task.updatedBy}` },
          { label: "Revision", value: String(task.revision) },
          { label: "Versions kept", value: String(task.history.length) },
        ]} />
        {task.history.length === 0 ? <Empty title="No earlier versions" /> : (
          <DataGrid
            rows={task.history.map((snapshot, index) => ({ ...snapshot, id: `${task.id}-${index}` }))}
            rowId={(row) => row.id}
            label="Task history"
            filterable={false}
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at) },
              { key: "status", header: "Stage", cell: (row) => <Pill>{String(row.fields.stage ?? row.status)}</Pill> },
              { key: "title", header: "Title then", cell: (row) => row.title },
            ]}
          />
        )}
        <Notice tone="info" title="Changing the owner keeps the attribution">
          Each version keeps who made it. Reassigning a task changes who it is for, never who did the earlier work.
        </Notice>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} title={task.title} subtitle={project ? `In ${project.title}` : undefined} actions={<Pill tone={stageOf(task) === "done" ? "success" : stageOf(task) === "blocked" ? "danger" : "neutral"} dot>{stageOf(task)}</Pill>}>
        <Stack gap={3}>
          <p>{task.summary}</p>
          <Properties rows={[
            { label: "Owner", value: <Row gap={2}><Avatar name={String(task.fields.assignee ?? task.ownerName)} size="sm" />{String(task.fields.assignee ?? task.ownerName)}</Row> },
            { label: "Priority", value: String(task.fields.priority ?? "normal") },
            { label: "Sprint", value: String(task.fields.sprint ?? "—") },
            { label: "Dates", value: <span className="ds-num">{context.date(task.startAt)} – {context.date(task.endAt)}</span> },
            { label: "Estimate", value: <span className="ds-num">{String(task.fields.estimateHours ?? 0)} hours</span> },
            { label: "Logged", value: <span className="ds-num">{time.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0)} hours</span> },
          ]} />
        </Stack>
      </Card>
      <Card span={5} title="Dependencies" subtitle={`${dependencies.length} before · ${dependents.length} after`}>
        <Stack gap={3}>
          <Stack gap={2}>
            {dependencies.map((dependency) => (
              <Row key={dependency.id} gap={2}>
                <Pill tone={stageOf(dependency) === "done" ? "success" : "warning"}>{stageOf(dependency)}</Pill>
                <button type="button" className="ds-grow ds-truncate" style={{ textAlign: "start", background: "none", border: 0, font: "inherit", color: "inherit", cursor: "pointer" }} onClick={() => context.navigate(`/o/${org.slug}/project/tasks/${dependency.id}`)}>{dependency.title}</button>
              </Row>
            ))}
            {dependencies.length === 0 && <span className="ds-subtle">Nothing has to happen first.</span>}
          </Stack>
          <Button size="sm" variant="secondary" onClick={() => context.openOverlay("dependency selector")}>Link work</Button>
        </Stack>
      </Card>
      <Card span={12} title="Checklist" subtitle={`${checklist.filter((item) => item.done).length} of ${checklist.length} done`}>
        <Stack gap={2}>
          {checklist.map((item) => <Row key={item.label} gap={2}><Pill tone={item.done ? "success" : "neutral"}>{item.done ? "done" : "to do"}</Pill><span>{item.label}</span></Row>)}
          {checklist.length === 0 && <span className="ds-subtle">No checklist.</span>}
        </Stack>
      </Card>
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-006 · Timeline & Dependencies
 * ------------------------------------------------------------------ */

export function TimelineScreen({ context, lens }: { context: ScreenContext; lens: "Timeline" | "Critical path" | "Baseline" | "Risks" }) {
  const data = useProjectData();
  const record = useRecord(context.params.id);
  const { org, now } = useWorkspace();
  // A stale/wrong-company detail URL must never display the first project.
  const project = context.params.id
    ? (record?.collection === "projects" && record.organizationId === org.id ? record : undefined)
    : data.projects[0];
  /* Hooks run before any early return: the project arrives one render late. */
  const tasks = useMemo(() => (project ? tasksOf(data.tasks, project.id) : []), [data.tasks, project]);
  const path = useMemo(() => criticalPath(tasks), [tasks]);
  if (!project) return <Empty title="No project" />;

  if (lens === "Critical path") {
    const chain = path.map((id) => tasks.find((task) => task.id === id)).filter((task): task is Rec => Boolean(task));
    return (
      <Stack gap={4}>
        <Gantt context={context} tasks={tasks} highlight={path} onPick={(task) => context.navigate(`/o/${org.slug}/project/tasks/${task.id}`)} />
        <Card title="The chain" subtitle={`${chain.length} tasks, ${chain.reduce((sum, task) => sum + (task.startAt && task.endAt ? daysBetween(new Date(task.startAt), new Date(task.endAt)) : 0), 0)} days end to end`}>
          <Stack gap={2}>
            {chain.map((task, index) => (
              <Row key={task.id} gap={2}>
                <span className="ds-num ds-subtle" style={{ width: 24 }}>{index + 1}</span>
                <span className="ds-grow ds-truncate">{task.title}</span>
                <span className="ds-subtle">{context.date(task.startAt, { day: "numeric", month: "short" })} – {context.date(task.endAt, { day: "numeric", month: "short" })}</span>
                <Pill tone={stageOf(task) === "done" ? "success" : stageOf(task) === "blocked" ? "danger" : "neutral"}>{stageOf(task)}</Pill>
              </Row>
            ))}
          </Stack>
          <Notice tone="info" title="Longest dependency chain by duration">
            This is the longest path through the recorded dependencies. It is not a float calculation and it does not know about
            resource conflicts, which are on the workload screen.
          </Notice>
        </Card>
      </Stack>
    );
  }

  if (lens === "Baseline") {
    const moved = tasks.filter((task) => {
      const base = String(task.fields.baselineEnd ?? "");
      return base && task.endAt && new Date(base).getTime() !== new Date(task.endAt).getTime();
    });
    return (
      <Stack gap={4}>
        <Gantt context={context} tasks={tasks} showBaseline onPick={(task) => context.navigate(`/o/${org.slug}/project/tasks/${task.id}`)} />
        {moved.length === 0 ? <Empty title="Nothing has moved from the baseline" /> : (
          <DataGrid
            rows={moved}
            rowId={(row) => row.id}
            label="Changes from baseline"
            filterable={false}
            rowTone={() => "warning"}
            columns={[
              { key: "title", header: "Task", primary: true, cell: (row) => row.title },
              { key: "base", header: "Baseline end", cell: (row) => context.date(String(row.fields.baselineEnd ?? "")) },
              { key: "now", header: "Planned end", cell: (row) => context.date(row.endAt) },
              { key: "slip", header: "Slip", align: "end", cell: (row) => {
                const days = daysBetween(new Date(String(row.fields.baselineEnd ?? "")), new Date(row.endAt ?? ""));
                return <span className="ds-num">{days > 0 ? `+${days}` : String(days)} days</span>;
              } },
            ]}
          />
        )}
      </Stack>
    );
  }

  if (lens === "Risks") {
    const late = tasks.filter((task) => task.endAt && new Date(task.endAt) < now && stageOf(task) !== "done");
    const impossible = tasks.filter((task) => dependenciesOf(task).some((id) => {
      const dependency = tasks.find((row) => row.id === id);
      return dependency?.endAt && task.startAt && new Date(dependency.endAt) > new Date(task.startAt);
    }));
    const rows = [
      ...late.map((task) => ({ id: `${task.id}-late`, kind: "Past its end date", detail: `${task.title} was due ${context.date(task.endAt)} and is ${stageOf(task)}.` })),
      ...impossible.map((task) => ({ id: `${task.id}-order`, kind: "Starts before its dependency ends", detail: `${task.title} starts ${context.date(task.startAt)}, before the work it depends on finishes.` })),
      ...tasks.filter((task) => stageOf(task) === "blocked").map((task) => ({ id: `${task.id}-blocked`, kind: "Blocked", detail: task.summary })),
    ];
    return rows.length === 0 ? <Empty title="No scheduling risks" icon={<Activity size={20} />} /> : (
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Schedule risks"
        filterable={false}
        rowTone={() => "warning"}
        columns={[
          { key: "kind", header: "Risk", primary: true, cell: (row) => row.kind },
          { key: "detail", header: "Detail", cell: (row) => row.detail },
        ]}
      />
    );
  }

  return <Gantt context={context} tasks={tasks} showBaseline onPick={(task) => { context.select(task.id); context.openOverlay("Date edit", { id: task.id }); }} />;
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-007 · Resource Workload
 * ------------------------------------------------------------------ */

export function Workload({ context, lens }: { context: ScreenContext; lens: "People" | "AI" | "Departments" | "Calendar" }) {
  const data = useProjectData();
  const { now } = useWorkspace();
  const open = data.tasks.filter((task) => task.fields.kind !== "onboarding" && stageOf(task) !== "done");

  if (lens === "AI") {
    const agents = data.members.filter((member) => member.fields.kind === "ai");
    return (
      <Stack gap={4}>
        <Notice tone="info" title="An agent is modelled differently from a person">
          A person has a working week, leave and a limit of one task at a time. An agent has a concurrency limit and no calendar:
          it cannot be ill, and it does not accrue leave. The two are never added into one capacity figure.
        </Notice>
        <Grid>
          {agents.map((agent) => {
            const delegated = data.tasks.filter((task) => task.fields.delegatedToAgent === true && String(task.fields.assignee ?? "") === agent.title);
            return (
              <Card key={agent.id} span={4} eyebrow="AI EMPLOYEE" prov="agent" machine title={<Row gap={2}><Avatar name={agent.title} kind="ai" size="sm" />{agent.title}</Row>} subtitle={String(agent.fields.title ?? "")}>
                <Stack gap={3}>
                  <Properties rows={[
                    { label: "Concurrency", value: `${String(agent.fields.concurrency ?? 1)} at once` },
                    { label: "Delegated now", value: String(delegated.length) },
                    { label: "Scope", value: String(agent.fields.scope ?? "Not recorded") },
                  ]} />
                  <Meter value={delegated.length} max={Number(agent.fields.concurrency ?? 1)} label={`${agent.title} load`} tone={delegated.length >= Number(agent.fields.concurrency ?? 1) ? "warning" : undefined} />
                </Stack>
              </Card>
            );
          })}
          {agents.length === 0 && <Empty title="No AI employees" icon={<Users size={20} />} />}
        </Grid>
      </Stack>
    );
  }

  if (lens === "Departments") {
    return (
      <Grid>
        {data.departments.map((department) => {
          const projects = data.projects.filter((project) => project.fields.departmentId === department.id);
          const tasks = projects.flatMap((project) => tasksOf(data.tasks, project.id)).filter((task) => stageOf(task) !== "done");
          const hours = tasks.reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0);
          return (
            <Card key={department.id} span={4} title={department.title} subtitle={`${tasks.length} open tasks`}>
              <Properties rows={[
                { label: "Projects", value: String(projects.length) },
                { label: "Estimated hours outstanding", value: <span className="ds-num">{hours}h</span> },
                { label: "People with work", value: String([...new Set(tasks.map((task) => String(task.fields.assignee ?? "")))].filter(Boolean).length) },
              ]} />
            </Card>
          );
        })}
      </Grid>
    );
  }

  if (lens === "Calendar") {
    const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(now), index));
    const people = [...new Set(open.map((task) => String(task.fields.assignee ?? task.ownerName)))].filter(Boolean);
    return (
      <Stack gap={4}>
        <div className="pj-heat">
          <div className="pj-heat-name"><strong>Person</strong></div>
          {days.map((day) => <div key={day.toISOString()} className="pj-heat-cell"><strong>{context.date(day, { weekday: "short", day: "numeric" })}</strong></div>)}
          {people.map((person) => (
            <div key={person} style={{ display: "contents" }}>
              <div className="pj-heat-name">{person}</div>
              {days.map((day) => {
                const count = open.filter((task) => String(task.fields.assignee ?? task.ownerName) === person && task.startAt && task.endAt && new Date(task.startAt) <= day && new Date(task.endAt) >= day).length;
                return (
                  <div key={day.toISOString()} className="pj-heat-cell" data-load={count > 2 ? "over" : count === 2 ? "full" : count === 0 ? "free" : undefined} title={`${person}, ${context.date(day)}: ${count} tasks in flight`}>
                    {count || "·"}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="ds-subtle">A cell counts tasks whose dates span that day. More than two at once is shaded; a person cannot genuinely do three things at once.</p>
      </Stack>
    );
  }

  const people = [...new Set(open.map((task) => String(task.fields.assignee ?? task.ownerName)))].filter(Boolean);
  return (
    <Stack gap={4}>
      <Grid>
        {people.map((person) => {
          const assigned = open.filter((task) => String(task.fields.assignee ?? task.ownerName) === person);
          const hours = assigned.reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0);
          const capacity = 35;
          return (
            <Card
              key={person}
              span={4}
              title={<Row gap={2}><Avatar name={person} size="sm" />{person}</Row>}
              subtitle={`${assigned.length} open tasks`}
              actions={hours > capacity ? <Pill tone="danger" dot>Over capacity</Pill> : <Pill tone="success" dot>Within capacity</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => { context.select(assigned[0]?.id); context.openOverlay("Workload detail", { person }); }}>Detail</Button>}
            >
              <Stack gap={3}>
                <Meter value={hours} max={capacity} label={`${person} load`} tone={hours > capacity ? "danger" : hours > capacity * 0.85 ? "warning" : "success"} />
                <span className="ds-subtle"><span className="ds-num">{hours}</span> estimated hours against a <span className="ds-num">{capacity}</span> hour week.</span>
              </Stack>
            </Card>
          );
        })}
      </Grid>
      <Notice tone="info" title="Capacity is an estimate of estimates">
        The load is the sum of estimates on open tasks, compared with a thirty-five hour week. It does not know about approved
        leave; the people application does, and the two disagree on purpose rather than quietly.
      </Notice>
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-008 · Templates
 * ------------------------------------------------------------------ */

interface Phase { name: string; tasks: string[] }

export function Templates({ context, lens }: { context: ScreenContext; lens: "Company" | "Industry" | "Personal" }) {
  const data = useProjectData();
  const rows = data.templates.filter((template) => template.fields.kind === "project" && String(template.fields.scope ?? "Company") === lens);
  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} templates`} icon={<LayoutDashboard size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Template editor")}>Create a template</Button>} />
  ) : (
    <Grid>
      {rows.map((template) => {
        const phases = (template.body as { phases?: Phase[] } | undefined)?.phases ?? [];
        return (
          <Card
            key={template.id}
            span={6}
            title={template.title}
            subtitle={template.summary}
            actions={<Pill>{phases.length} phases</Pill>}
            footer={<>
              <Button size="sm" variant="primary" onClick={() => { context.select(template.id); context.openOverlay("preview", { id: template.id }); }}>Apply</Button>
              <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Template editor", { id: template.id })}>Edit</Button>
            </>}
          >
            <Stack gap={2}>
              {phases.map((phase) => (
                <div key={phase.name}>
                  <strong>{phase.name}</strong>
                  <p className="ds-subtle">{phase.tasks.join(" · ")}</p>
                </div>
              ))}
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-009 · Goals & OKRs
 * ------------------------------------------------------------------ */

interface CheckIn { at: string; by: string; note: string; value: number }

export function Goals({ context, lens }: { context: ScreenContext; lens: "Company" | "Team" | "Personal" | "Check-ins" }) {
  const data = useProjectData();
  const objectives = data.objectives;

  if (lens === "Check-ins") {
    const rows = objectives.flatMap((objective) => ((objective.body as { checkIns?: CheckIn[] } | undefined)?.checkIns ?? []).map((checkIn, index) => ({ ...checkIn, id: `${objective.id}-${index}`, objective: objective.title })));
    const sorted = [...rows].sort((a, b) => b.at.localeCompare(a.at));
    return sorted.length === 0 ? <Empty title="No check-ins recorded" icon={<Timer size={20} />} /> : (
      <Stack gap={3}>
        {sorted.map((checkIn) => (
          <div key={checkIn.id} className="ds-panel" style={{ padding: "var(--space-4)" }}>
            <Row gap={2}>
              <strong className="ds-grow">{checkIn.objective}</strong>
              <span className="ds-num">{checkIn.value}</span>
              <span className="ds-subtle">{context.date(checkIn.at)}</span>
            </Row>
            <p className="ds-subtle">{checkIn.note} — {checkIn.by}</p>
          </div>
        ))}
      </Stack>
    );
  }

  const rows = objectives.filter((objective) => String(objective.fields.scope ?? "Company") === lens);
  return rows.length === 0 ? (
    <Empty title={`No ${lens.toLowerCase()} objectives`} icon={<Activity size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("goal revision")}>Set a target</Button>} />
  ) : (
    <Grid>
      {rows.map((objective) => {
        const target = Number(objective.fields.target ?? 0);
        const current = Number(objective.fields.current ?? 0);
        const ratio = target === 0 ? 0 : current / target;
        const linked = String(objective.fields.projectIds ?? "").split(",").filter(Boolean).map((id) => data.projects.find((project) => project.id === id)).filter((project): project is Rec => Boolean(project));
        return (
          <Card
            key={objective.id}
            span={6}
            title={objective.title}
            subtitle={objective.summary}
            actions={<Pill tone={ratio >= 1 ? "success" : ratio >= 0.6 ? "info" : "warning"}>{target ? `${Math.round(ratio * 100)}%` : "No target"}</Pill>}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => { context.select(objective.id); context.openOverlay("check-in dialog", { id: objective.id }); }}>Report progress</Button>
              <Button size="sm" variant="ghost" onClick={() => { context.select(objective.id); context.openOverlay("Metric source", { id: objective.id }); }}>Where this number comes from</Button>
            </>}
          >
            <Stack gap={3}>
              <Meter value={current} max={Math.max(1, target)} label={objective.title} tone={ratio >= 1 ? "success" : ratio < 0.5 ? "warning" : undefined} />
              <Properties rows={[
                { label: "Measure", value: String(objective.fields.measure ?? "Not set") },
                { label: "Current", value: String(current) },
                { label: "Target", value: target ? String(target) : "Not set" },
                { label: "Owner", value: objective.ownerName },
                { label: "Linked projects", value: linked.length ? linked.map((project) => project.title).join(", ") : "None" },
              ]} />
            </Stack>
          </Card>
        );
      })}
    </Grid>
  );
}

/* ------------------------------------------------------------------ *
 * ARL-PROJECT-010 · Time & Cost
 * ------------------------------------------------------------------ */

export function TimeAndCost({ context, lens }: { context: ScreenContext; lens: "My time" | "Team" | "Costs" | "Approvals" }) {
  const data = useProjectData();
  const employees = useCollections(["employees"]).employees;
  const { actor, org } = useWorkspace();
  const [timeView, setTimeView] = useState<"all" | "pending" | "approved">("all");
  const entries = data.shifts.filter((entry) => entry.fields.kind === "time");
  const mine = entries.filter((entry) => String(entry.fields.employeeName ?? entry.ownerName) === actor);
  const approved = entries.filter((entry) => entry.status === "approved" && entry.fields.approved === true);
  const pending = entries.filter((entry) => entry.status !== "approved" || entry.fields.approved !== true);
  const knownRate = (entry: Rec) => {
    const rate = Number(entry.fields.rateMinor);
    return entry.fields.rateMinor !== undefined && Number.isFinite(rate) && rate > 0;
  };
  const sumHours = (rows: Rec[]) => rows.reduce((sum, entry) => {
    const hours = Number(entry.fields.hours);
    return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
  }, 0);
  const readyRated = approved.filter((entry) => entry.fields.billable === true && knownRate(entry));
  const unrated = approved.filter((entry) => entry.fields.billable === true && !knownRate(entry));
  const knownSubtotal = (rows: Rec[]) => rows.reduce((sum, entry) =>
    sum + Number(entry.fields.hours ?? 0) * Number(entry.fields.rateMinor ?? 0), 0);
  const intro = (section: string, title: string, description: string) => (
    <OpsHeader eyebrow={`Projects / Time & Cost / ${section}`} title={title} description={description}
      actions={<Button variant="primary" onClick={() => context.openOverlay("Timer")}>Log time</Button>}
      note="Only manually recorded time appears here. No external timer, invoice or payroll is connected."
    />
  );

  if (lens === "Costs") {
    const byProject = (id: string) => entries.filter((entry) => entry.fields.projectId === id);
    return (
      <Stack gap={4}>
        {intro("Costs", "Project effort, without invented prices.", "Compare the time recorded on projects with explicit rated approvals and budgets. Unknown rates stay visibly unpriced.")}
        <OpsMetrics label="Project time cost overview">
          <OpsMetric label="Time recorded" value={sumHours(entries).toFixed(2)} detail="All project time records" />
          <OpsMetric label="Approved & rated" value={readyRated.length} detail="Billable entries with a known rate" emphasis="positive" />
          <OpsMetric label="Unpriced approvals" value={unrated.length} detail="Rate evidence is still required" emphasis={unrated.length ? "attention" : "neutral"} />
          <OpsMetric label="Illustrative net" value={readyRated.length ? context.money(knownSubtotal(readyRated)) : "—"} detail="Approved rated entries only, before tax" />
        </OpsMetrics>
        <DataGrid
          rows={data.projects}
          rowId={(row) => row.id}
          label="Project time and known costs"
          onOpen={(id) => context.navigate(`/o/${org.slug}/project/projects/${id}`)}
          columns={[
            { key: "title", header: "Project", primary: true, cell: (row) => row.title,
              sortValue: (row) => row.title, filterValue: (row) => row.title },
            { key: "hours", header: "Recorded hours", align: "end", cell: (row) =>
              <span className="ds-num">{sumHours(byProject(row.id)).toFixed(2)}</span> },
            { key: "approved", header: "Approved hours", align: "end", cell: (row) =>
              <span className="ds-num">{sumHours(byProject(row.id).filter((entry) => entry.status === "approved" && entry.fields.approved === true)).toFixed(2)}</span> },
            { key: "labour", header: "Known rated net", align: "end", cell: (row) => {
              const rated = byProject(row.id).filter((entry) => entry.status === "approved"
                && entry.fields.approved === true && entry.fields.billable === true && knownRate(entry));
              return rated.length ? <span className="ds-num">{context.money(knownSubtotal(rated))}</span>
                : <span className="ds-subtle">No rated approvals</span>;
            } },
            { key: "unpriced", header: "Rate missing", align: "end", cell: (row) => {
              const count = byProject(row.id).filter((entry) => entry.status === "approved"
                && entry.fields.approved === true && entry.fields.billable === true && !knownRate(entry)).length;
              return count ? <Pill tone="warning">{count} unpriced</Pill> : <span className="ds-subtle">—</span>;
            } },
            { key: "budget", header: "Budget", align: "end", cell: (row) =>
              row.fields.budgetMinor === undefined ? <span className="ds-subtle">Not recorded</span>
                : <span className="ds-num">{context.money(Number(row.fields.budgetMinor))}</span> },
          ]}
        />
        <Notice tone="warning" title="Cost estimates are not invoices">
          This screen never invents a rate, treats an unknown rate as zero or equates approved time with revenue.
          Finance must verify the billable agreement, tax and customer independently. Agent compute is not employee billable time.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Approvals") {
    const canApprove = context.can("edit_people");
    return (
      <Stack gap={4}>
        {intro("Approvals", "Time decisions with a clear owner.", "Submitted entries stay linked to the employee and project they came from. Decisions are saved together or not at all.")}
        <OpsMetrics label="Project time approvals">
          <OpsMetric label="Needs review" value={pending.length} detail={`${sumHours(pending).toFixed(2)} submitted hours`} emphasis={pending.length ? "attention" : "neutral"} />
          <OpsMetric label="Approved entries" value={approved.length} detail={`${sumHours(approved).toFixed(2)} approved hours`} emphasis="positive" />
          <OpsMetric label="Missing employee" value={pending.filter((entry) =>
            !employees.some((person) => person.id === entry.fields.employeeId)).length} detail="Correct the source link first" />
          <OpsMetric label="Recorded entries" value={entries.length} detail="Across all company projects" />
        </OpsMetrics>
        {!canApprove && <Notice tone="info" title="People approval required">
          Project members can review submitted work, but only the appropriate People role or owner can approve hours.
        </Notice>}
        {pending.length === 0 ? (
          <Empty title="No hours waiting for approval" icon={<Timer size={20} />}>
            A newly logged time entry appears here once submitted.
          </Empty>
        ) : (
          <DataGrid
            rows={pending}
            rowId={(row) => row.id}
            label="Hours waiting for approval"
            columns={[
              { key: "who", header: "Person", primary: true, cell: (row) => String(row.fields.employeeName ?? row.ownerName),
                filterValue: (row) => String(row.fields.employeeName ?? row.ownerName) },
              { key: "project", header: "Project", cell: (row) =>
                data.projects.find((project) => project.id === row.fields.projectId)?.title ?? "Not linked" },
              { key: "day", header: "Day", cell: (row) => context.date(row.startAt), sortValue: (row) => row.startAt ?? "" },
              { key: "hours", header: "Hours", align: "end", cell: (row) =>
                <span className="ds-num">{String(row.fields.hours ?? 0)}</span> },
            ]}
            bulkActions={[{
              label: "Approve selected time",
              disabled: () => !canApprove,
              onRun: async (selected) => {
                try {
                  const plan = planTimesheetApprovals({
                    organizationId: context.org.id, currency: context.org.currency,
                    actor: context.actor, now: clockIso(), timezone: context.org.timezone,
                  }, selected, employees, data.projects);
                  await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
                  context.toast("Hours approved", `${selected.length} entries were approved together with source revision checks. No payroll was submitted.`);
                } catch (error) {
                  context.toast("Hours not approved", error instanceof Error ? error.message : "Reload and review the source records.", "blocked");
                }
              },
            }]}
          />
        )}
      </Stack>
    );
  }

  const selected = lens === "My time" ? mine : entries;
  const rows = timeView === "pending"
    ? selected.filter((entry) => entry.status !== "approved" || entry.fields.approved !== true)
    : timeView === "approved"
      ? selected.filter((entry) => entry.status === "approved" && entry.fields.approved === true)
      : selected;
  return (
    <Stack gap={4}>
      {intro(lens, lens === "My time" ? "Your work, recorded precisely." : "Time across the team.",
        lens === "My time"
          ? "A clean record of the hours attributed to you, ready for a human review. No calendar or background activity is assumed."
          : "All recorded employee work, tied to real Projects and tasks, with approval states immediately visible.")}
      <OpsMetrics label="Project time summary">
        <OpsMetric label="Recorded hours" value={sumHours(selected).toFixed(2)} detail={`${selected.length} entries`} />
        <OpsMetric label="Billable hours" value={sumHours(selected.filter((entry) => entry.fields.billable === true)).toFixed(2)}
          detail="Marked potentially billable" />
        <OpsMetric label="Awaiting review" value={selected.filter((entry) => entry.fields.approved !== true || entry.status !== "approved").length}
          detail="Human approval outstanding" />
        <OpsMetric label="Approved hours" value={sumHours(selected.filter((entry) => entry.status === "approved" && entry.fields.approved === true)).toFixed(2)}
          detail="Approved local records" emphasis="positive" />
      </OpsMetrics>
      <div className="ops-toolbar" aria-label="Filter project time">
        <strong className="ops-toolbar-heading">{lens === "My time" ? "My entries" : "Team entries"}</strong>
        <Button size="sm" variant={timeView === "all" ? "secondary" : "ghost"} aria-pressed={timeView === "all"} onClick={() => setTimeView("all")}>All</Button>
        <Button size="sm" variant={timeView === "pending" ? "secondary" : "ghost"} aria-pressed={timeView === "pending"} onClick={() => setTimeView("pending")}>Needs approval</Button>
        <Button size="sm" variant={timeView === "approved" ? "secondary" : "ghost"} aria-pressed={timeView === "approved"} onClick={() => setTimeView("approved")}>Approved</Button>
      </div>
      {rows.length === 0 ? (
        <Empty title={selected.length ? "No entries in this filter" : "No time recorded"} icon={<Timer size={20} />}
          action={<Button variant="primary" onClick={() => context.openOverlay("Timer")}>Log time</Button>}>
          {selected.length ? "Switch the review filter to view other entries." : "Only explicitly logged hours appear here, never estimated calendar activity."}
        </Empty>
      ) : (
        <DataGrid
          rows={rows}
          rowId={(row) => row.id}
          label="Project time entries"
          columns={[
            { key: "day", header: "Day", primary: true, cell: (row) => context.date(row.startAt), sortValue: (row) => row.startAt ?? "" },
            { key: "who", header: "Person", cell: (row) => String(row.fields.employeeName ?? row.ownerName), hideBelow: 700 },
            { key: "against", header: "Project", cell: (row) => data.projects.find((project) => project.id === row.fields.projectId)?.title ?? "Not linked" },
            { key: "hours", header: "Hours", align: "end", cell: (row) => <span className="ds-num">{String(row.fields.hours ?? 0)}</span>,
              sortValue: (row) => Number(row.fields.hours ?? 0) },
            { key: "billable", header: "Billable", align: "end", cell: (row) =>
              <Pill tone={row.fields.billable === true ? "accent" : "neutral"}>{row.fields.billable === true ? "Marked" : "No"}</Pill> },
            { key: "state", header: "State", align: "end", cell: (row) =>
              <Pill tone={row.status === "approved" && row.fields.approved === true ? "success" : "warning"}>
                {row.status === "approved" && row.fields.approved === true ? "Approved" : "Needs approval"}
              </Pill> },
          ]}
          summary={<strong className="ds-num">{sumHours(rows).toFixed(2)} hours shown</strong>}
          onSelect={(id) => context.select(id)}
        />
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------ *
 * Overlay bodies
 * ------------------------------------------------------------------ */

export function TaskDrawer({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = useRecord(payload?.id ?? context.selectedId);
  const { org } = useWorkspace();
  if (!task) return <Empty title="Select a task" icon={<ListChecks size={20} />} />;
  const checklist = checklistOf(task);
  return (
    <Stack gap={4}>
      <div>
        <h3>{task.title}</h3>
        <p className="ds-subtle">{task.summary}</p>
      </div>
      <Properties rows={[
        { label: "Stage", value: <Pill tone={stageOf(task) === "done" ? "success" : "neutral"}>{stageOf(task)}</Pill> },
        { label: "Owner", value: String(task.fields.assignee ?? task.ownerName) },
        { label: "Priority", value: String(task.fields.priority ?? "normal") },
        { label: "Dates", value: <span className="ds-num">{context.date(task.startAt)} – {context.date(task.endAt)}</span> },
        { label: "Estimate", value: `${String(task.fields.estimateHours ?? 0)}h, ${String(task.fields.loggedHours ?? 0)}h logged` },
      ]} />
      <Stack gap={2}>
        {checklist.map((item) => <Row key={item.label} gap={2}><Pill tone={item.done ? "success" : "neutral"}>{item.done ? "done" : "to do"}</Pill><span>{item.label}</span></Row>)}
      </Stack>
      <Row gap={2}>
        <Button variant="primary" onClick={() => context.navigate(`/o/${org.slug}/project/tasks/${task.id}`)}>Open the task</Button>
        <Button variant="secondary" onClick={() => context.openOverlay("Assignee picker", { id: task.id })}>Reassign</Button>
      </Row>
    </Stack>
  );
}

export function AssigneePicker({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = useRecord(payload?.id ?? context.selectedId);
  const data = useCollections(["members", "employees"]);
  const people = [...data.employees.filter((row) => row.status !== "alumni"), ...data.members.filter((row) => row.fields.kind === "ai")];
  const [choice, setChoice] = useState("");
  if (!task) return <Empty title="Select a task first" />;
  const chosen = people.find((person) => person.id === choice);
  const isAgent = chosen?.fields.kind === "ai";
  return (
    <form
      id="pj-assignee"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!chosen) return;
        await context.mutate.patch(task.id, {
          fields: { ...task.fields, assignee: chosen.title, delegatedToAgent: isAgent },
        }, { expectRevision: task.revision, event: `${task.title} assigned to ${chosen.title} by ${context.actor}` });
        context.toast("Owner changed", `${task.title} is now with ${chosen.title}. Earlier work keeps its attribution.`);
        close();
      }}
    >
      <Field label="Assign to" required>
        <Select value={choice} onChange={(event) => setChoice(event.target.value)} required>
          <option value="">Choose a person or an AI employee</option>
          <optgroup label="People">
            {data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </optgroup>
          <optgroup label="AI employees">
            {data.members.filter((row) => row.fields.kind === "ai").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </optgroup>
        </Select>
      </Field>
      <Properties rows={[
        { label: "Currently", value: String(task.fields.assignee ?? task.ownerName) },
        { label: "Created by", value: task.createdBy },
        { label: "Earlier versions", value: `${task.history.length} kept with their author` },
      ]} />
      {isAgent && (
        <Notice tone="warning" title="Delegating to an AI employee">
          The agent drafts and records evidence against the task. It cannot move the task past Review, and no model provider is
          connected, so nothing runs until a person acts on the draft.
        </Notice>
      )}
    </form>
  );
}

export function DependencySelector({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = useRecord(payload?.id ?? context.params.id ?? context.selectedId);
  const data = useProjectData();
  const [choice, setChoice] = useState("");
  if (!task) return <Empty title="Open a task first" />;
  const siblings = data.tasks.filter((row) => row.parentId === task.parentId && row.id !== task.id);
  const cycle = choice ? createsCycle(data.tasks, task.id, choice) : false;
  const chosen = data.tasks.find((row) => row.id === choice);
  const impossible = Boolean(chosen?.endAt && task.startAt && new Date(chosen.endAt) > new Date(task.startAt));
  return (
    <form
      id="pj-dependency"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!choice || cycle) return;
        const current = dependenciesOf(task);
        await context.mutate.patch(task.id, {
          fields: { ...task.fields, dependsOn: [...new Set([...current, choice])].join(",") },
        }, { expectRevision: task.revision, event: `${task.title} now depends on ${chosen?.title ?? choice}` });
        context.toast("Dependency saved", `${task.title} waits for ${chosen?.title ?? "the linked task"}.`);
        close();
      }}
    >
      <Field label={`${task.title} depends on`} required>
        <Select value={choice} onChange={(event) => setChoice(event.target.value)} required>
          <option value="">Choose a task</option>
          {siblings.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      {cycle && <Notice tone="danger" title="That would create a cycle">{chosen?.title} already waits for this task, directly or through another one. The link is refused rather than saved.</Notice>}
      {!cycle && impossible && (
        <Notice tone="warning" title="The dates do not allow this order">
          {chosen?.title} ends {context.date(chosen?.endAt)}, after {task.title} starts {context.date(task.startAt)}.
          The link can be saved, and it will appear on the schedule risks tab until one of the dates moves.
        </Notice>
      )}
      <Properties rows={[
        { label: "Already waits for", value: dependenciesOf(task).map((id) => data.tasks.find((row) => row.id === id)?.title ?? id).join(", ") || "Nothing" },
      ]} />
    </form>
  );
}

export function DateEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const task = useRecord(payload?.id ?? context.selectedId);
  const data = useProjectData();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  if (!task) return <Empty title="Select a bar on the timeline" icon={<CalendarRange size={20} />} />;
  const startValue = start || (task.startAt ?? "").slice(0, 10);
  const endValue = end || (task.endAt ?? "").slice(0, 10);
  const backwards = new Date(endValue) < new Date(startValue);
  const blockers = dependenciesOf(task)
    .map((id) => data.tasks.find((row) => row.id === id))
    .filter((row): row is Rec => Boolean(row?.endAt) && new Date(row!.endAt!) > new Date(startValue));
  return (
    <form
      id="pj-dates"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (backwards || blockers.length > 0) return;
        await context.mutate.patch(task.id, {
          startAt: new Date(`${startValue}T09:00:00.000Z`).toISOString(),
          endAt: new Date(`${endValue}T09:00:00.000Z`).toISOString(),
          dueAt: new Date(`${endValue}T09:00:00.000Z`).toISOString(),
        }, { expectRevision: task.revision, event: `${task.title} rescheduled` });
        context.toast("Dates saved", `${task.title} now runs ${context.date(startValue)} to ${context.date(endValue)}.`);
        close();
      }}
    >
      <h3>{task.title}</h3>
      <Row gap={3}>
        <Field label="Starts" required><TextInput type="date" value={startValue} onChange={(event) => setStart(event.target.value)} required /></Field>
        <Field label="Ends" required><TextInput type="date" value={endValue} onChange={(event) => setEnd(event.target.value)} invalid={backwards} required /></Field>
      </Row>
      {backwards && <Notice tone="danger" title="The end is before the start">A bar cannot run backwards.</Notice>}
      {blockers.length > 0 && (
        <Notice tone="danger" title="This start is before the work it depends on finishes">
          {blockers.map((row) => `${row.title} ends ${context.date(row.endAt)}`).join("; ")}. Publishing an impossible order is refused.
        </Notice>
      )}
      <Properties rows={[
        { label: "Baseline", value: task.fields.baselineEnd ? `${context.date(String(task.fields.baselineStart ?? ""))} – ${context.date(String(task.fields.baselineEnd ?? ""))}` : "Not baselined" },
      ]} />
    </form>
  );
}

export function MetricSource({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const objective = useRecord(payload?.id ?? context.selectedId);
  const data = useProjectData();
  if (!objective) return <Empty title="Select an objective" />;
  const linked = String(objective.fields.projectIds ?? "").split(",").filter(Boolean).map((id) => data.projects.find((project) => project.id === id)).filter((project): project is Rec => Boolean(project));
  const checkIns = (objective.body as { checkIns?: CheckIn[] } | undefined)?.checkIns ?? [];
  return (
    <Stack gap={4}>
      <h3>{objective.title}</h3>
      <Properties rows={[
        { label: "Measure", value: String(objective.fields.measure ?? "Not set") },
        { label: "Latest value", value: String(objective.fields.current ?? 0) },
        { label: "Set by", value: checkIns.at(-1)?.by ?? objective.ownerName },
        { label: "Set on", value: checkIns.at(-1) ? context.date(checkIns.at(-1)!.at) : context.date(objective.updatedAt) },
        { label: "Linked projects", value: linked.length ? linked.map((project) => project.title).join(", ") : "None" },
      ]} />
      <Notice tone="info" title="A person reported this number">
        Progress on an objective comes from a check-in written by a named person, with a note. It is not inferred from task counts,
        because a count of tasks is not the same as progress towards a measure.
      </Notice>
      <Stack gap={2}>
        {checkIns.map((checkIn, index) => (
          <Row key={index} gap={2}>
            <span className="ds-subtle" style={{ width: 96 }}>{context.date(checkIn.at)}</span>
            <span className="ds-grow">{checkIn.note}</span>
            <strong className="ds-num">{checkIn.value}</strong>
          </Row>
        ))}
      </Stack>
    </Stack>
  );
}

export function CheckInDialog({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const objective = useRecord(payload?.id ?? context.selectedId);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  if (!objective) return <Empty title="Select an objective" />;
  return (
    <form
      id="pj-checkin"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const checkIns = (objective.body as { checkIns?: CheckIn[] } | undefined)?.checkIns ?? [];
        const next = [...checkIns, { at: clockIso(), by: context.actor, note, value: Number(value) || 0 }];
        await context.mutate.patch(objective.id, {
          fields: { ...objective.fields, current: Number(value) || Number(objective.fields.current ?? 0) },
          body: { ...(objective.body as object ?? {}), checkIns: next },
        }, { expectRevision: objective.revision, event: `Check-in on ${objective.title} by ${context.actor}` });
        context.toast("Check-in recorded", `${objective.title} is at ${value} ${String(objective.fields.measure ?? "")}.`);
        close();
      }}
    >
      <h3>{objective.title}</h3>
      <Field label={`Current ${String(objective.fields.measure ?? "value")}`} required>
        <TextInput value={value} inputMode="numeric" align="end" onChange={(event) => setValue(event.target.value)} placeholder={String(objective.fields.current ?? 0)} required />
      </Field>
      <Field label="What changed, and how you know" required hint="A check-in without evidence is a guess with a date on it.">
        <TextArea value={note} onChange={(event) => setNote(event.target.value)} rows={3} required />
      </Field>
    </form>
  );
}
