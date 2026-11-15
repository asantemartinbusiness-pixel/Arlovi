import { useState } from "react";
import { CalendarRange, FolderKanban, Gauge, LayoutDashboard, ListChecks, Target, Timer, Users } from "lucide-react";
import {
  Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useRecord, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import { stageOf } from "./board";
import {
  AssigneePicker, BoardScreen, CheckInDialog, DateEdit, DependencySelector, Goals, MetricSource, Portfolio,
  ProjectDirectory, ProjectOverview, TaskDetail, TaskDrawer, Templates, TimelineScreen, TimeAndCost, Workload,
  useProjectData,
} from "./panels";
import "./project.css";
import { kitOverlays, needsSelection } from "@/applications/hr/opsKit";
import { approveHours } from "@/applications/hr/actions";
import {
  AssignOwner, AttachFile, BoardFilter, ChangeStatus, CommentForm, DelegateAI, DurationEdit, LinkProject, MoveTask, NewTask,
  PortfolioReport, TaskEditor, duplicateProject, duplicateTemplate, exportTime, matchesPortfolio, portfolioFilter, requestUpdate, togglePin,
} from "./actions";
import { getRecord } from "@/platform/repo";

/** On project-scoped screens the initial selection is the project itself; a task action needs a task. */
async function withTask(context: ScreenContext, what: string, then: (task: Rec) => void): Promise<void> {
  const task = context.selectedId ? await getRecord(context.selectedId) : undefined;
  if (!task || task.collection !== "tasks") { context.toast(`Select ${what} first`, "Nothing was changed.", "blocked"); return; }
  then(task);
}

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

interface Phase { name: string; tasks: string[] }

function ProjectFromTemplate({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const template = data.templates.find((row) => row.id === templateId);
  const phases = (template?.body as { phases?: Phase[] } | undefined)?.phases ?? [];
  const duplicate = data.projects.some((project) => project.title.trim().toLowerCase() === title.trim().toLowerCase());

  return (
    <form
      id="pj-create"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const now = new Date();
        const end = new Date(now.getTime() + 60 * 86_400_000);
        const project = await context.mutate.create({
          collection: "projects",
          title: title.trim(),
          status: "planning",
          summary: template ? `Created from the ${template.title} template.` : "Created from scratch.",
          startAt: now.toISOString(),
          endAt: end.toISOString(),
          dueAt: end.toISOString(),
          amountMinor: 0,
          fields: { health: "on_track", priority: "normal", programme: "Unassigned", budgetMinor: 0, spentMinor: 0, automationPaused: false },
        }, `Project created: ${title.trim()}`);
        let offset = 0;
        for (const phase of phases) {
          for (const label of phase.tasks) {
            offset += 3;
            const start = new Date(now.getTime() + (offset - 3) * 86_400_000);
            const finish = new Date(now.getTime() + offset * 86_400_000);
            await context.mutate.create({
              collection: "tasks",
              title: label,
              status: "backlog",
              summary: `${phase.name} phase, from the ${template?.title ?? "template"}.`,
              parentId: project.id,
              startAt: start.toISOString(),
              endAt: finish.toISOString(),
              dueAt: finish.toISOString(),
              fields: { stage: "backlog", assignee: context.actor, priority: "normal", estimateHours: 8, loggedHours: 0, sprint: phase.name, kind: "task", dependsOn: "", delegatedToAgent: false },
            }, `Task created from template: ${label}`);
          }
        }
        context.toast("Project created", phases.length ? `${phases.reduce((sum, phase) => sum + phase.tasks.length, 0)} tasks were created from the template.` : "An empty project is ready for its plan.");
        close();
      }}
    >
      <Field label="Project name" required>
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required />
      </Field>
      {duplicate && <Notice tone="danger" title="A project with that name exists">Two projects with one name make a rollup ambiguous.</Notice>}
      <Field label="Start from" hint="A template creates its phases as tasks; it never copies files or comments from an earlier project.">
        <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          <option value="">Nothing — an empty project</option>
          {data.templates.filter((row) => row.fields.kind === "project").map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      {phases.length > 0 && (
        <Properties rows={phases.map((phase) => ({ label: phase.name, value: phase.tasks.join(", ") }))} />
      )}
      <Notice tone="info" title="A clone starts clean">
        Confidential attachments, comments and approvals from the source project are not copied. Only the phase and task structure is.
      </Notice>
    </form>
  );
}

function PortfolioFilter({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const applied = portfolioFilter.use();
  const [programme, setProgramme] = useState(applied.programme);
  const [health, setHealth] = useState(applied.health);
  const matched = data.projects.filter((project) =>
    (!programme || String(project.fields.programme ?? "") === programme)
    && (!health || String(project.fields.health ?? "") === health));
  return (
    <Stack gap={4}>
      <Field label="Programme">
        <Select value={programme} onChange={(event) => setProgramme(event.target.value)}>
          <option value="">Every programme</option>
          {[...new Set(data.projects.map((project) => String(project.fields.programme ?? "")))].filter(Boolean).map((value) => <option key={value}>{value}</option>)}
        </Select>
      </Field>
      <Field label="Health">
        <Select value={health} onChange={(event) => setHealth(event.target.value)}>
          <option value="">Any health</option>
          {["on_track", "at_risk", "off_track"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
        </Select>
      </Field>
      <Stack gap={2}>
        {matched.map((project) => (
          <Row key={project.id} gap={2}>
            <span className="ds-grow ds-truncate">{project.title}</span>
            <Pill tone={project.fields.health === "off_track" ? "danger" : project.fields.health === "at_risk" ? "warning" : "success"} dot>{String(project.fields.health ?? "").replace("_", " ")}</Pill>
          </Row>
        ))}
      </Stack>
      <Row gap={2}>
        <Button variant="ghost" onClick={() => { portfolioFilter.set({ programme: "", health: "" }); close(); }}>Clear</Button>
        <Button variant="ghost" onClick={() => { context.navigate(`/o/${context.org.slug}/project/projects`); close(); }}>Open the directory</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={() => { portfolioFilter.set({ programme, health }); close(); }}>Filter the portfolio ({matched.length})</Button>
      </Row>
    </Stack>
  );
}

function PriorityChange({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const project = useRecord(context.selectedId) ?? data.projects[0];
  if (!project) return <Empty title="Select a project" />;
  return (
    <form
      id="pj-priority"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.patch(project.id, {
          fields: { ...project.fields, priority: String(form.get("priority") ?? "normal"), health: String(form.get("health") ?? project.fields.health) },
        }, { expectRevision: project.revision, event: `${project.title} priority and health set by ${context.actor}` });
        context.toast("Priority saved", `${project.title} is now ${String(form.get("priority"))} priority.`);
        close();
      }}
    >
      <h3>{project.title}</h3>
      <Field label="Priority"><Select name="priority" defaultValue={String(project.fields.priority ?? "normal")}>{["low", "normal", "high"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      <Field label="Health, as its owner sees it">
        <Select name="health" defaultValue={String(project.fields.health ?? "on_track")}>
          {["on_track", "at_risk", "off_track"].map((value) => <option key={value} value={value}>{value.replace("_", " ")}</option>)}
        </Select>
      </Field>
      <Notice tone="info">Health is a judgement a named person makes. Nothing in this workspace sets it automatically from a task count.</Notice>
    </form>
  );
}

function MilestoneEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const project = useRecord(context.params.id) ?? data.projects[0];
  if (!project) return <Empty title="Open a project first" />;
  return (
    <form
      id="pj-milestone"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const date = String(form.get("date") ?? "");
        await context.mutate.create({
          collection: "tasks",
          title: String(form.get("title") ?? "Milestone"),
          status: "ready",
          summary: String(form.get("note") ?? ""),
          parentId: project.id,
          startAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
          endAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
          dueAt: new Date(`${date}T09:00:00.000Z`).toISOString(),
          fields: { stage: "ready", assignee: context.actor, priority: "high", estimateHours: 0, loggedHours: 0, sprint: "", kind: "milestone", dependsOn: "", delegatedToAgent: false },
        }, `Milestone added to ${project.title}`);
        context.toast("Milestone added", "It is on the plan and on the timeline.");
        close();
      }}
    >
      <Field label="Milestone" required><TextInput name="title" required /></Field>
      <Field label="Date" required><TextInput name="date" type="date" required /></Field>
      <Field label="What it means"><TextArea name="note" rows={3} /></Field>
      <Notice tone="info">A milestone is a task with no duration, so it appears as a diamond on the timeline.</Notice>
    </form>
  );
}

function ProjectSettings({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const project = useRecord(context.params.id) ?? data.projects[0];
  if (!project) return <Empty title="Open a project first" />;
  return (
    <form
      id="pj-settings"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.patch(project.id, {
          status: String(form.get("status") ?? project.status),
          fields: { ...project.fields, automationPaused: form.get("paused") === "on", programme: String(form.get("programme") ?? project.fields.programme) },
        }, { expectRevision: project.revision, event: `${project.title} settings changed by ${context.actor}` });
        context.toast("Settings saved", form.get("paused") === "on" ? "Automation configured on this project is paused. Unrelated work keeps running." : "Settings saved on the project record.");
        close();
      }}
    >
      <Field label="Status"><Select name="status" defaultValue={project.status}>{["planning", "active", "paused", "done", "archived"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      <Field label="Programme"><TextInput name="programme" defaultValue={String(project.fields.programme ?? "")} /></Field>
      <Checkbox name="paused" label="Pause automation configured on this project" defaultChecked={project.fields.automationPaused === true} />
      <Notice tone="info" title="What pausing does, exactly">
        It stops automation configured on this project. Tasks stay where they are, time entries keep saving, and automation on
        other projects is untouched.
      </Notice>
    </form>
  );
}

function StatusNote({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const project = useRecord(context.params.id) ?? data.projects[0];
  if (!project) return <Empty title="Open a project first" />;
  const tasks = data.tasks.filter((task) => task.parentId === project.id && task.fields.kind !== "onboarding");
  const done = tasks.filter((task) => stageOf(task) === "done").length;
  const blocked = tasks.filter((task) => stageOf(task) === "blocked");
  return (
    <form
      id="pj-status"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.log(`${project.title} update by ${context.actor}: ${String(form.get("note") ?? "")}`, { entityId: project.id, type: "status" });
        context.toast("Update recorded", "It is in the project activity with your name on it.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Counted progress", value: `${done} of ${tasks.length} tasks done` },
        { label: "Blocked", value: blocked.length ? blocked.map((task) => task.title).join(", ") : "Nothing" },
        { label: "Budget committed", value: context.money(Number(project.fields.spentMinor ?? 0)) },
      ]} />
      <Field label="What a person wants to add" required hint="The figures above are counted. This is the part a model could not know.">
        <TextArea name="note" rows={4} required defaultValue={blocked.length ? `${blocked[0].title} is the thing holding this up.` : ""} />
      </Field>
    </form>
  );
}

function StageRule({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string; lane?: string } | undefined;
  const task = useRecord(payload?.id ?? context.selectedId);
  if (!task) return <Empty title="No task" />;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        {task.title} is high priority and has not been through Review. Moving it straight to Done skips the second pair of eyes
        the board expects.
      </p>
      <Properties rows={[
        { label: "Current stage", value: stageOf(task) },
        { label: "Requested stage", value: String(payload?.lane ?? "done") },
        { label: "What the rule is for", value: "High priority work gets a reviewer before it is called finished" },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Leave it where it is</Button>
        <span className="ds-grow" />
        <Button variant="secondary" onClick={async () => {
          await context.mutate.patch(task.id, { status: "review", fields: { ...task.fields, stage: "review" } }, { expectRevision: task.revision, event: `${task.title} sent to review` });
          context.toast("Moved to Review", "The reviewer can move it on from there.");
          close();
        }}>Send to Review instead</Button>
        <Button variant="primary" onClick={async () => {
          await context.mutate.patch(task.id, { status: "done", fields: { ...task.fields, stage: "done", reviewSkippedBy: context.actor } }, { expectRevision: task.revision, event: `${task.title} marked done without review by ${context.actor}` });
          context.toast("Moved to Done", "The skipped review is recorded against your name on the task.");
          close();
        }}>Move anyway and record it</Button>
      </Row>
    </Stack>
  );
}

function BatchReview({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const project = useRecord(context.params.id) ?? data.projects[0];
  const candidates = data.tasks.filter((task) => task.parentId === project?.id && stageOf(task) === "doing");
  return (
    <Stack gap={4}>
      <p className="ds-prose">Moving {candidates.length} tasks from Doing to Review in one step. Each row below is the record that would change.</p>
      {candidates.length === 0 ? <Empty title="Nothing is in Doing" /> : (
        <DataGrid
          rows={candidates}
          rowId={(row) => row.id}
          label="Tasks that would move"
          filterable={false}
          columns={[
            { key: "title", header: "Task", primary: true, cell: (row) => row.title },
            { key: "owner", header: "Owner", cell: (row) => String(row.fields.assignee ?? row.ownerName) },
          ]}
        />
      )}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={candidates.length === 0}
          onClick={async () => {
            for (const task of candidates) {
              await context.mutate.patch(task.id, { status: "review", fields: { ...task.fields, stage: "review" } }, { event: `${task.title} moved to review in a batch by ${context.actor}` });
            }
            context.toast("Batch applied", `${candidates.length} tasks moved to Review, each with its own audit entry.`);
            close();
          }}
        >
          Move {candidates.length} tasks
        </Button>
      </Row>
    </Stack>
  );
}

function WorkloadDetail({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { person?: string } | undefined;
  const data = useProjectData();
  const selected = useRecord(context.selectedId);
  const person = payload?.person ?? String(selected?.fields.assignee ?? "");
  const assigned = data.tasks.filter((task) => String(task.fields.assignee ?? task.ownerName) === person && stageOf(task) !== "done" && task.fields.kind !== "onboarding");
  if (!person) return <Empty title="Choose a person" icon={<Users size={20} />} />;
  return (
    <Stack gap={4}>
      <h3>{person}</h3>
      <Properties rows={[
        { label: "Open tasks", value: String(assigned.length) },
        { label: "Estimated hours", value: `${assigned.reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0)}h` },
        { label: "Projects involved", value: String(new Set(assigned.map((task) => task.parentId)).size) },
      ]} />
      <Stack gap={2}>
        {assigned.map((task) => (
          <Row key={task.id} gap={2}>
            <span className="ds-grow ds-truncate">{task.title}</span>
            <Pill tone={stageOf(task) === "blocked" ? "danger" : "neutral"}>{stageOf(task)}</Pill>
            <span className="ds-subtle ds-num">{String(task.fields.estimateHours ?? 0)}h</span>
          </Row>
        ))}
      </Stack>
      <Notice tone="info">Reassigning here changes the owner on the task and keeps who did the earlier work.</Notice>
    </Stack>
  );
}

function AllocationEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const task = useRecord(context.selectedId);
  if (!task) return <Empty title="Select a task first" icon={<ListChecks size={20} />} />;
  return (
    <form
      id="pj-allocation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.patch(task.id, {
          fields: { ...task.fields, estimateHours: Number(form.get("estimate") ?? 0), assignee: String(form.get("assignee") ?? task.fields.assignee) },
        }, { expectRevision: task.revision, event: `Estimate and owner changed on ${task.title}` });
        context.toast("Allocation saved", "The estimate and owner are on the task record.");
        close();
      }}
    >
      <h3>{task.title}</h3>
      <Field label="Owner">
        <Select name="assignee" defaultValue={String(task.fields.assignee ?? "")}>
          {[...new Set(data.tasks.map((row) => String(row.fields.assignee ?? row.ownerName)))].filter(Boolean).map((person) => <option key={person}>{person}</option>)}
        </Select>
      </Field>
      <Field label="Estimated hours"><TextInput name="estimate" inputMode="numeric" align="end" defaultValue={String(task.fields.estimateHours ?? 0)} /></Field>
      <Notice tone="info">Changing an estimate changes the capacity figures on this screen, which are a sum of estimates.</Notice>
    </form>
  );
}

function OverCapacity({ context }: { context: ScreenContext }) {
  const data = useProjectData();
  const open = data.tasks.filter((task) => stageOf(task) !== "done" && task.fields.kind !== "onboarding");
  const people = [...new Set(open.map((task) => String(task.fields.assignee ?? task.ownerName)))].filter(Boolean);
  const over = people
    .map((person) => ({ person, hours: open.filter((task) => String(task.fields.assignee ?? task.ownerName) === person).reduce((sum, task) => sum + Number(task.fields.estimateHours ?? 0), 0) }))
    .filter((row) => row.hours > 35);
  return over.length === 0 ? <Empty title="Nobody is over capacity" icon={<Gauge size={20} />} /> : (
    <Stack gap={3}>
      {over.map((row) => (
        <div key={row.person} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}><strong className="ds-grow">{row.person}</strong><Pill tone="danger" dot>{row.hours}h of 35</Pill></Row>
          <p className="ds-subtle">Open task estimates exceed a normal week. Move work or change an estimate; neither happens on its own.</p>
          <Button size="sm" variant="secondary" style={{ marginBlockStart: "var(--space-2)" }} onClick={() => context.openOverlay("Workload detail", { person: row.person })}>See what they hold</Button>
        </div>
      ))}
    </Stack>
  );
}

function TemplateEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = useRecord(payload?.id);
  const phases = (existing?.body as { phases?: Phase[] } | undefined)?.phases ?? [];
  return (
    <form
      id="pj-template"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const text = String(form.get("phases") ?? "");
        const parsed: Phase[] = text.split("\n").filter(Boolean).map((line) => {
          const [name, tasks] = line.split(":");
          return { name: (name ?? "Phase").trim(), tasks: (tasks ?? "").split(",").map((task) => task.trim()).filter(Boolean) };
        });
        const fields = { kind: "project", scope: String(form.get("scope") ?? "Company"), phases: parsed.length, tasks: parsed.reduce((sum, phase) => sum + phase.tasks.length, 0) };
        if (existing) {
          await context.mutate.patch(existing.id, { title: String(form.get("title") ?? existing.title), summary: String(form.get("summary") ?? ""), fields: { ...existing.fields, ...fields }, body: { phases: parsed } }, { expectRevision: existing.revision, event: `Template updated: ${existing.title}` });
        } else {
          await context.mutate.create({ collection: "templates", title: String(form.get("title") ?? "Template"), status: "published", summary: String(form.get("summary") ?? ""), fields, body: { phases: parsed } }, `Template created: ${String(form.get("title") ?? "")}`);
        }
        context.toast("Template saved", "It is available when a project is created.");
        close();
      }}
    >
      <Field label="Template name" required><TextInput name="title" defaultValue={existing?.title ?? ""} required /></Field>
      <Field label="What it is for"><TextArea name="summary" rows={2} defaultValue={existing?.summary ?? ""} /></Field>
      <Field label="Scope"><Select name="scope" defaultValue={String(existing?.fields.scope ?? "Company")}>{["Company", "Industry", "Personal"].map((scope) => <option key={scope}>{scope}</option>)}</Select></Field>
      <Field label="Phases" hint="One phase per line, as Phase name: task, task, task">
        <TextArea name="phases" rows={6} defaultValue={phases.map((phase) => `${phase.name}: ${phase.tasks.join(", ")}`).join("\n")} />
      </Field>
    </form>
  );
}

function TemplatePreview({ context, close }: { context: ScreenContext; close: () => void }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const template = useRecord(payload?.id ?? context.selectedId);
  const [name, setName] = useState("");
  if (!template) return <Empty title="Select a template" />;
  const phases = (template.body as { phases?: Phase[] } | undefined)?.phases ?? [];
  const count = phases.reduce((sum, phase) => sum + phase.tasks.length, 0);
  return (
    <Stack gap={4}>
      <h3>{template.title}</h3>
      <p className="ds-subtle">{template.summary}</p>
      <Properties rows={phases.map((phase) => ({ label: phase.name, value: phase.tasks.join(", ") }))} />
      <Field label="New project name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Notice tone="info" title="What is copied and what is not">
        {count} tasks across {phases.length} phases are created. Attachments, comments and approvals from any earlier project
        built on this template are not copied.
      </Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={async () => {
            const now = new Date();
            const end = new Date(now.getTime() + 60 * 86_400_000);
            const project = await context.mutate.create({
              collection: "projects", title: name.trim(), status: "planning",
              summary: `Created from the ${template.title} template.`,
              startAt: now.toISOString(), endAt: end.toISOString(), dueAt: end.toISOString(), amountMinor: 0,
              fields: { health: "on_track", priority: "normal", programme: "Unassigned", budgetMinor: 0, spentMinor: 0, automationPaused: false },
            }, `Project created from template: ${name.trim()}`);
            let offset = 0;
            for (const phase of phases) {
              for (const label of phase.tasks) {
                offset += 3;
                await context.mutate.create({
                  collection: "tasks", title: label, status: "backlog", summary: `${phase.name} phase.`, parentId: project.id,
                  startAt: new Date(now.getTime() + (offset - 3) * 86_400_000).toISOString(),
                  endAt: new Date(now.getTime() + offset * 86_400_000).toISOString(),
                  dueAt: new Date(now.getTime() + offset * 86_400_000).toISOString(),
                  fields: { stage: "backlog", assignee: context.actor, priority: "normal", estimateHours: 8, loggedHours: 0, sprint: phase.name, kind: "task", dependsOn: "", delegatedToAgent: false },
                }, `Task created from template: ${label}`);
              }
            }
            context.toast("Project created", `${count} tasks were created in ${name.trim()}.`);
            context.navigate(`/o/${context.org.slug}/project/projects/${project.id}`);
            close();
          }}
        >
          Create the project
        </Button>
      </Row>
    </Stack>
  );
}

function RevisionConfirm({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const template = useRecord(context.selectedId) ?? data.templates[0];
  if (!template) return <Empty title="Select a template" />;
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Publishing a revision of {template.title} changes it for every project created from now on. Projects already created keep
        the structure they were given.
      </p>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={async () => {
          await context.mutate.patch(template.id, { status: "published", fields: { ...template.fields, revisedBy: context.actor } }, { expectRevision: template.revision, event: `${template.title} revision published by ${context.actor}` });
          context.toast("Revision published", "Existing projects are untouched.");
          close();
        }}>Publish the revision</Button>
      </Row>
    </Stack>
  );
}

function GoalRevision({ context, close }: { context: ScreenContext; close: () => void }) {
  const objective = useRecord(context.selectedId);
  return (
    <form
      id="pj-goal"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const fields = {
          measure: String(form.get("measure") ?? ""), target: Number(form.get("target") ?? 0),
          current: Number(objective?.fields.current ?? 0), scope: String(form.get("scope") ?? "Company"), projectIds: String(objective?.fields.projectIds ?? ""),
        };
        if (objective) {
          await context.mutate.patch(objective.id, { title: String(form.get("title") ?? objective.title), fields: { ...objective.fields, ...fields } }, { expectRevision: objective.revision, event: `Target changed on ${objective.title} by ${context.actor}` });
        } else {
          await context.mutate.create({ collection: "objectives", title: String(form.get("title") ?? "Objective"), status: "active", summary: String(form.get("why") ?? ""), fields, body: { checkIns: [] } }, `Objective created by ${context.actor}`);
        }
        context.toast("Objective saved", "The target and its measure are on the record.");
        close();
      }}
    >
      <Field label="Objective" required><TextInput name="title" defaultValue={objective?.title ?? ""} required /></Field>
      <Row gap={3}>
        <Field label="Measure" required><TextInput name="measure" defaultValue={String(objective?.fields.measure ?? "")} placeholder="Units packed" required /></Field>
        <Field label="Target"><TextInput name="target" inputMode="numeric" align="end" defaultValue={String(objective?.fields.target ?? 0)} /></Field>
      </Row>
      <Field label="Scope"><Select name="scope" defaultValue={String(objective?.fields.scope ?? "Company")}>{["Company", "Team", "Personal"].map((scope) => <option key={scope}>{scope}</option>)}</Select></Field>
      <Field label="Why this matters"><TextArea name="why" rows={3} defaultValue={objective?.summary ?? ""} /></Field>
      <Notice tone="warning" title="A changed target is a decision">
        Moving a target is recorded with your name against the objective, so a goal that was met after being lowered reads honestly later.
      </Notice>
    </form>
  );
}

function TimerOverlay({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const [running, setRunning] = useState(false);
  const [minutes, setMinutes] = useState(30);
  const tasks = data.tasks.filter((task) => stageOf(task) !== "done" && task.fields.kind !== "onboarding");
  return (
    <form
      id="pj-timer"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const taskId = String(form.get("task") ?? "");
        const task = data.tasks.find((row) => row.id === taskId);
        const hours = Math.round((minutes / 60) * 4) / 4;
        const now = new Date();
        await context.mutate.create({
          collection: "shifts",
          title: `${context.actor.split(" ")[0]} · ${hours}h`,
          status: "submitted",
          summary: `Logged against ${task?.title ?? "a task"}.`,
          startAt: new Date(now.getTime() - minutes * 60_000).toISOString(),
          endAt: now.toISOString(),
          fields: {
            kind: "time", employeeName: context.actor, taskId, projectId: task?.parentId ?? "",
            hours, billable: form.get("billable") === "on", approved: false, rateMinor: 6_500,
          },
        }, `Time logged by ${context.actor}`);
        context.toast("Time logged", `${hours} hours are on the timesheet, waiting for approval.`);
        close();
      }}
    >
      <Field label="Against which task" required>
        <Select name="task" required>
          <option value="">Choose a task</option>
          {tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Field label="Minutes"><TextInput inputMode="numeric" align="end" value={String(minutes)} onChange={(event) => setMinutes(Number(event.target.value) || 0)} /></Field>
        <Field label=" ">
          <Button variant={running ? "outline-danger" : "secondary"} onClick={() => setRunning((value) => !value)}>{running ? "Stop the timer" : "Start a timer"}</Button>
        </Field>
      </Row>
      {running && <Notice tone="info">The timer is a local stopwatch. The entry is created when you save, with the minutes shown above.</Notice>}
      <Checkbox name="billable" label="Billable to a customer" />
      <Notice tone="warning" title="Only a person's time goes here">
        Work done by an AI employee is not logged as billable hours. It belongs in the finance ledger as a cost, not on a timesheet.
      </Notice>
    </form>
  );
}

function TimesheetCorrection({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const entry = useRecord(context.selectedId) ?? data.shifts.find((row) => row.fields.kind === "time");
  if (!entry) return <Empty title="Select a time entry" icon={<Timer size={20} />} />;
  return (
    <form
      id="pj-correction"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        await context.mutate.patch(entry.id, {
          status: "submitted",
          fields: { ...entry.fields, hours: Number(form.get("hours") ?? 0), approved: false, correctedBy: context.actor, correctionReason: String(form.get("reason") ?? "") },
        }, { expectRevision: entry.revision, event: `Time entry corrected by ${context.actor}: ${String(form.get("reason") ?? "")}` });
        context.toast("Correction saved", "The entry is back to submitted so it is approved again.");
        close();
      }}
    >
      <Properties rows={[
        { label: "Person", value: String(entry.fields.employeeName ?? entry.ownerName) },
        { label: "Day", value: context.date(entry.startAt) },
        { label: "Currently", value: `${String(entry.fields.hours ?? 0)} hours` },
      ]} />
      <Field label="Corrected hours" required><TextInput name="hours" inputMode="decimal" align="end" defaultValue={String(entry.fields.hours ?? 0)} required /></Field>
      <Field label="Why" required><TextArea name="reason" rows={3} required /></Field>
      <Notice tone="warning">A correction clears the approval, so somebody approves the corrected figure rather than the old one.</Notice>
    </form>
  );
}

function BillingLink({ context }: { context: ScreenContext }) {
  const data = useProjectData();
  const billable = data.shifts.filter((entry) => entry.fields.kind === "time" && entry.fields.billable === true);
  const total = billable.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0) * Number(entry.fields.rateMinor ?? 0), 0);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Billable entries", value: String(billable.length) },
        { label: "Hours", value: String(billable.reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0)) },
        { label: "At the recorded rate", value: context.money(total) },
      ]} />
      <Notice tone="info" title="Billing happens in Finance">
        This screen can total billable time. Turning it into an invoice is a finance decision with tax on it, which belongs in
        the finance application rather than here.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/fin/invoices`)}>Open invoices</Button>
    </Stack>
  );
}

function ArchiveImpact({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useProjectData();
  const project = useRecord(context.selectedId) ?? data.projects[0];
  if (!project) return <Empty title="Select a project" />;
  const tasks = data.tasks.filter((task) => task.parentId === project.id);
  const open = tasks.filter((task) => stageOf(task) !== "done");
  return (
    <Stack gap={4}>
      <p className="ds-prose">
        Archiving {project.title} takes it out of the live directory. Its {tasks.length} tasks, their history and any mission or
        audit entry that references them stay exactly where they are.
      </p>
      <Properties rows={[
        { label: "Open tasks", value: String(open.length) },
        { label: "Time entries kept", value: String(data.shifts.filter((entry) => entry.fields.projectId === project.id).length) },
        { label: "Linked objectives", value: String(data.objectives.filter((objective) => String(objective.fields.projectIds ?? "").includes(project.id)).length) },
      ]} />
      {open.length > 0 && <Notice tone="warning" title={`${open.length} tasks are not finished`}>They will still exist, and they will still be assigned to somebody.</Notice>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="danger" onClick={async () => {
          await context.mutate.patch(project.id, { status: "archived" }, { expectRevision: project.revision, event: `${project.title} archived by ${context.actor}` });
          context.toast("Project archived", "It is out of the live directory and still in the history.");
          close();
        }}>Archive {project.title}</Button>
      </Row>
    </Stack>
  );
}

function QuickDetail({ context }: { context: ScreenContext }) {
  const data = useProjectData();
  const project = useRecord(context.selectedId) ?? data.projects[0];
  if (!project) return <Empty title="Select a project" icon={<FolderKanban size={20} />} />;
  const tasks = data.tasks.filter((task) => task.parentId === project.id && task.fields.kind !== "onboarding");
  return (
    <Stack gap={4}>
      <h3>{project.title}</h3>
      <p className="ds-subtle">{project.summary}</p>
      <Properties rows={[
        { label: "Owner", value: project.ownerName },
        { label: "Health", value: String(project.fields.health ?? "").replace("_", " ") },
        { label: "Tasks", value: `${tasks.filter((task) => stageOf(task) === "done").length} of ${tasks.length} done` },
        { label: "Dates", value: `${context.date(project.startAt)} – ${context.date(project.endAt)}` },
        { label: "Budget", value: `${context.money(Number(project.fields.spentMinor ?? 0))} of ${context.money(Number(project.fields.budgetMinor ?? 0))}` },
      ]} />
      <Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/project/projects/${project.id}`)}>Open the project</Button>
    </Stack>
  );
}

function InitiativeDetail({ context }: { context: ScreenContext }) {
  const data = useProjectData();
  const filter = portfolioFilter.use();
  const rows: Rec[] = data.projects.filter((project) => matchesPortfolio(project, filter));
  return (
    <Stack gap={3}>
      <p className="ds-subtle">Health is set by each project's owner; the evidence beside it is counted. Each project is counted once, with its own budget and its own tasks.</p>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Portfolio detail"
        filterable={false}
        columns={[
          { key: "title", header: "Project", primary: true, cell: (row) => row.title },
          { key: "health", header: "Health", cell: (row) => <Pill tone={row.fields.health === "off_track" ? "danger" : row.fields.health === "at_risk" ? "warning" : "success"} dot>{String(row.fields.health ?? "unknown").replace("_", " ")}</Pill> },
          { key: "blocked", header: "Blocked", align: "end", cell: (row) => String(data.tasks.filter((task) => task.parentId === row.id && stageOf(task) === "blocked").length) },
          { key: "tasks", header: "Tasks", align: "end", cell: (row) => String(data.tasks.filter((task) => task.parentId === row.id && task.fields.kind !== "onboarding").length) },
          { key: "budget", header: "Budget", align: "end", cell: (row) => <span className="ds-num">{context.money(Number(row.fields.budgetMinor ?? 0))}</span> },
          { key: "spent", header: "Committed", align: "end", cell: (row) => <span className="ds-num">{context.money(Number(row.fields.spentMinor ?? 0))}</span> },
        ]}
      />
    </Stack>
  );
}

function ConflictReview({ context }: { context: ScreenContext }) {
  const data = useProjectData();
  const { now } = useWorkspace();
  const problems = data.tasks.filter((task) => {
    const deps = String(task.fields.dependsOn ?? "").split(",").filter(Boolean);
    return deps.some((id) => {
      const dependency = data.tasks.find((row) => row.id === id);
      return dependency?.endAt && task.startAt && new Date(dependency.endAt) > new Date(task.startAt);
    });
  });
  const late = data.tasks.filter((task) => task.endAt && new Date(task.endAt) < now && stageOf(task) !== "done" && task.fields.kind !== "onboarding");
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Impossible orders", value: String(problems.length) },
        { label: "Past their end date", value: String(late.length) },
      ]} />
      {problems.map((task) => (
        <Notice key={task.id} tone="danger" title={task.title}>
          Starts {context.date(task.startAt)}, before the work it depends on finishes. The schedule cannot be published while this is true.
        </Notice>
      ))}
      {problems.length === 0 && <Notice tone="success" title="No impossible dates">Every task starts after the work it waits for.</Notice>}
    </Stack>
  );
}

function DependencyGraph({ context }: { context: ScreenContext }) {
  const data = useProjectData();
  const project = useRecord(context.params.id) ?? data.projects[0];
  const tasks = data.tasks.filter((task) => task.parentId === project?.id);
  return (
    <Stack gap={3}>
      {tasks.map((task) => {
        const deps = String(task.fields.dependsOn ?? "").split(",").filter(Boolean);
        return (
          <div key={task.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
            <strong>{task.title}</strong>
            <p className="ds-subtle">
              {deps.length === 0 ? "Waits for nothing." : `Waits for ${deps.map((id) => tasks.find((row) => row.id === id)?.title ?? id).join(", ")}.`}
            </p>
          </div>
        );
      })}
      {tasks.length === 0 && <Empty title="No tasks" />}
    </Stack>
  );
}

export const projectApp = registerApp({
  code: "PROJECT",
  short: "Projects",
  name: "Projects, Portfolios & Work",
  purpose: "Plans, boards, timelines and where the hours actually went",
  icon: LayoutDashboard,
  nav: [
    { items: [
      { label: "Portfolio", screenId: "ARL-PROJECT-001", icon: Gauge },
      { label: "Projects", screenId: "ARL-PROJECT-002", icon: FolderKanban },
    ] },
    { label: "Plan", items: [
      { label: "Timeline", screenId: "ARL-PROJECT-006", icon: CalendarRange },
      { label: "Task board", screenId: "ARL-PROJECT-004", icon: ListChecks },
      { label: "Templates", screenId: "ARL-PROJECT-008", icon: LayoutDashboard },
    ] },
    { label: "Measure", items: [
      { label: "Workload", screenId: "ARL-PROJECT-007", icon: Users },
      { label: "Goals & OKRs", screenId: "ARL-PROJECT-009", icon: Target },
      { label: "Time & Cost", screenId: "ARL-PROJECT-010", icon: Timer },
    ] },
  ],
  screens: {
    "ARL-PROJECT-001": {
      id: "ARL-PROJECT-001",
      subtitle: (context) => `Every programme in ${context.org.shortName}, counted from the project records.`,
      tabs: (["Overview", "Departments", "Timeline", "Risks"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Portfolio context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create project", label: "Create a project", placement: "primary", run: (context) => context.openOverlay("create project") },
        { id: "filter", label: "Filter the portfolio", placement: "secondary", run: (context) => context.openOverlay("Portfolio filter") },
        { id: "inspect health", label: "Inspect health", placement: "overflow", run: (context) => context.openOverlay("initiative detail") },
        { id: "portfolio report", label: "Portfolio report", placement: "overflow", run: (context) => context.openOverlay("portfolio report") },
        { id: "change priority", label: "Change a priority", placement: "overflow", guard: needsSelection("a project"), run: (context) => context.openOverlay("priority change") },
      ],
      overlays: [
        { id: "create project", kind: "modal", title: "Create a project", width: 600, render: ({ close, ...context }) => <ProjectFromTemplate context={context} close={close} />, footer: submitFooter("pj-create", "Create project") },
        { id: "portfolio report", kind: "drawer", title: "Portfolio report", width: 680, render: ({ close, ...context }) => <PortfolioReport context={context} close={close} /> },
        { id: "Portfolio filter", kind: "drawer", title: "Filter the portfolio", width: 480, render: ({ close, ...context }) => <PortfolioFilter context={context} close={close} /> },
        { id: "initiative detail", kind: "drawer", title: "Project health and its evidence", width: 620, render: ({ ...context }) => <InitiativeDetail context={context} /> },
        { id: "priority change", kind: "modal", title: "Priority and health", width: 520, render: ({ close, ...context }) => <PriorityChange context={context} close={close} />, footer: submitFooter("pj-priority", "Save") },
      ],
    },

    "ARL-PROJECT-002": {
      id: "ARL-PROJECT-002",
      subtitle: () => "Every project, its owner, its counted progress and when it last moved.",
      tabs: (["All", "Mine", "Following", "Archived"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ProjectDirectory context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create", label: "Create a project", placement: "primary", run: (context) => context.openOverlay("Project template") },
        { id: "duplicate", label: "Duplicate", placement: "secondary", guard: needsSelection("a project"), run: (context) => duplicateProject(context) },
        { id: "archive", label: "Archive", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a project first"), run: (context) => context.openOverlay("archive impact") },
        { id: "pin", label: "Pin or unpin", placement: "overflow", guard: needsSelection("a project"), run: (context) => togglePin(context) },
        { id: "search", label: "Search projects", placement: "overflow", run: () => { requestAnimationFrame(() => document.querySelector<HTMLElement>('input[type="search"]')?.focus()); } },
        { id: "quick detail", label: "Quick detail", placement: "overflow", guard: needsSelection("a project"), run: (context) => context.openOverlay("quick detail") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Project template", kind: "modal", title: "Create a project", width: 600, render: ({ close, ...context }) => <ProjectFromTemplate context={context} close={close} />, footer: submitFooter("pj-create", "Create project") },
        { id: "archive impact", kind: "modal", title: "Archive this project", tone: "danger", width: 540, render: ({ close, ...context }) => <ArchiveImpact context={context} close={close} /> },
        { id: "quick detail", kind: "drawer", title: "Project", width: 460, render: ({ ...context }) => <QuickDetail context={context} /> },
      ],
    },

    "ARL-PROJECT-003": {
      id: "ARL-PROJECT-003",
      title: () => "Project overview",
      subtitle: () => "Plan, people, budget and what is actually blocked.",
      tabs: ["Overview", "Tasks", "Timeline", "Files", "Activity", "Metrics"].map((lens) => ({
        id: lens, render: (context: ScreenContext) => <ProjectOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Change status", label: "Change status", placement: "primary", run: (context) => context.openOverlay("change status") },
        { id: "request update", label: "Request an update", placement: "secondary", run: async (context) => requestUpdate(context, await getRecord(context.params.id ?? "")) },
        { id: "assign owner", label: "Assign an owner", placement: "overflow", run: (context) => context.openOverlay("assign owner") },
        { id: "attach file", label: "Attach a file", placement: "overflow", run: (context) => context.openOverlay("attach file") },
        { id: "post update", label: "Post an update", placement: "overflow", run: (context) => context.openOverlay("status note") },
        { id: "add milestone", label: "Add a milestone", placement: "overflow", run: (context) => context.openOverlay("Milestone editor") },
        { id: "settings", label: "Project settings", placement: "overflow", run: (context) => context.openOverlay("project settings") },
        { id: "open board", label: "Open the board", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/project/projects/${context.params.id}/board`) },
      ],
      overlays: [
        ...kitOverlays,
        { id: "change status", kind: "modal", title: "Change the project status", width: 520, render: ({ close, ...context }) => <ChangeStatus context={context} close={close} />, footer: submitFooter("pj-change-status", "Change status") },
        { id: "assign owner", kind: "modal", title: "Assign an owner", width: 480, render: ({ close, ...context }) => <AssignOwner context={context} close={close} />, footer: submitFooter("pj-owner", "Assign the owner") },
        { id: "attach file", kind: "modal", title: "Attach a file", width: 520, render: ({ close, ...context }) => <AttachFile context={context} close={close} />, footer: submitFooter("pj-attach", "Attach") },
        { id: "Milestone editor", kind: "modal", title: "Add a milestone", width: 520, render: ({ close, ...context }) => <MilestoneEditor context={context} close={close} />, footer: submitFooter("pj-milestone", "Add milestone") },
        { id: "project settings", kind: "modal", title: "Project settings", width: 560, render: ({ close, ...context }) => <ProjectSettings context={context} close={close} />, footer: submitFooter("pj-settings", "Save settings") },
        { id: "status note", kind: "modal", title: "Post a status update", width: 560, render: ({ close, ...context }) => <StatusNote context={context} close={close} />, footer: submitFooter("pj-status", "Record the update") },
      ],
    },

    "ARL-PROJECT-004": {
      id: "ARL-PROJECT-004",
      title: () => "Task board",
      subtitle: () => "Arrow keys move a card between lanes; the pointer does the same thing.",
      tabs: (["Board", "List", "By owner", "By sprint"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <BoardScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "create", label: "New task", placement: "primary", run: (context) => context.openOverlay("new task") },
        { id: "bulk move", label: "Move Doing to Review", placement: "secondary", run: (context) => context.openOverlay("batch action review") },
        { id: "Drag task", label: "Move a task", placement: "overflow", guard: needsSelection("a card on the board"), run: (context) => withTask(context, "a card on the board", () => context.openOverlay("move task")) },
        { id: "assign", label: "Assign a task", placement: "overflow", guard: needsSelection("a card"), run: (context) => withTask(context, "a card", (task) => context.openOverlay("Assignee picker", { id: task.id })) },
        { id: "filter", label: "Filter the board", placement: "overflow", run: (context) => context.openOverlay("board filter") },
      ],
      overlays: [
        { id: "new task", kind: "modal", title: "New task", width: 560, render: ({ close, ...context }) => <NewTask context={context} close={close} />, footer: submitFooter("pj-new-task", "Create the task") },
        { id: "move task", kind: "modal", title: "Move a task", width: 480, render: ({ close, ...context }) => <MoveTask context={context} close={close} /> },
        { id: "board filter", kind: "modal", title: "Filter the board", width: 440, render: ({ close, ...context }) => <BoardFilter context={context} close={close} /> },
        { id: "Task drawer", kind: "drawer", title: "Task", width: 520, render: ({ ...context }) => <TaskDrawer context={context} /> },
        { id: "stage rule", kind: "modal", title: "This move skips a review", tone: "danger", width: 540, render: ({ close, ...context }) => <StageRule context={context} close={close} /> },
        { id: "batch action review", kind: "modal", title: "Review this batch first", width: 620, render: ({ close, ...context }) => <BatchReview context={context} close={close} /> },
        { id: "Assignee picker", kind: "modal", title: "Assign this task", width: 520, render: ({ close, ...context }) => <AssigneePicker context={context} close={close} />, footer: submitFooter("pj-assignee", "Assign") },
      ],
    },

    "ARL-PROJECT-005": {
      id: "ARL-PROJECT-005",
      title: () => "Task",
      subtitle: () => "Description, checklist, dependencies, time and who did what.",
      tabs: ["Details", "Discussion", "Subtasks", "History"].map((lens) => ({
        id: lens, render: (context: ScreenContext) => <TaskDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "complete", label: "Mark complete", placement: "primary", run: (context) => context.openOverlay("completion check") },
        { id: "Edit", label: "Edit the task", placement: "secondary", run: (context) => context.openOverlay("task editor") },
        { id: "link", label: "Link work", placement: "overflow", run: (context) => context.openOverlay("dependency selector") },
        { id: "comment", label: "Comment", placement: "overflow", run: (context) => context.openOverlay("comment") },
        { id: "delegate AI", label: "Delegate to an AI employee", placement: "overflow", run: (context) => context.openOverlay("delegate AI") },
        { id: "reassign", label: "Reassign", placement: "overflow", run: (context) => context.openOverlay("Assignee picker") },
      ],
      overlays: [
        { id: "task editor", kind: "modal", title: "Edit the task", width: 560, render: ({ close, ...context }) => <TaskEditor context={context} close={close} />, footer: submitFooter("pj-task-edit", "Save the task") },
        { id: "comment", kind: "modal", title: "Comment", width: 520, render: ({ close, ...context }) => <CommentForm context={context} close={close} />, footer: submitFooter("pj-comment", "Post the comment") },
        { id: "delegate AI", kind: "modal", title: "Delegate to an AI employee", width: 520, render: ({ close, ...context }) => <DelegateAI context={context} close={close} />, footer: submitFooter("pj-delegate", "Delegate") },
        { id: "Assignee picker", kind: "modal", title: "Assign this task", width: 520, render: ({ close, ...context }) => <AssigneePicker context={context} close={close} />, footer: submitFooter("pj-assignee", "Assign") },
        { id: "dependency selector", kind: "modal", title: "Link work", width: 560, render: ({ close, ...context }) => <DependencySelector context={context} close={close} />, footer: submitFooter("pj-dependency", "Save link") },
        { id: "completion check", kind: "modal", title: "Before this is called done", width: 560, render: ({ close, ...context }) => <CompletionCheck context={context} close={close} /> },
      ],
    },

    "ARL-PROJECT-006": {
      id: "ARL-PROJECT-006",
      title: () => "Timeline",
      subtitle: () => "Bars, milestones and the dependencies between them, drawn from the records.",
      tabs: (["Timeline", "Critical path", "Baseline", "Risks"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <TimelineScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Reschedule", label: "Reschedule", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Pick a bar on the timeline"), run: (context) => withTask(context, "a bar on the timeline", (task) => context.openOverlay("Date edit", { id: task.id })) },
        { id: "link task", label: "Link a task", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Pick a bar on the timeline"), run: (context) => withTask(context, "a bar on the timeline", (task) => context.openOverlay("link task", { id: task.id })) },
        { id: "compare baseline", label: "Compare to baseline", placement: "overflow", run: (context) => context.setTab("Baseline") },
        { id: "drag duration", label: "Change a duration", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Pick a bar on the timeline"), run: (context) => withTask(context, "a bar on the timeline", () => context.openOverlay("duration edit")) },
        { id: "check conflicts", label: "Check for conflicts", placement: "overflow", run: (context) => context.openOverlay("conflict review") },
        { id: "dependency graph", label: "What waits for what", placement: "overflow", run: (context) => context.openOverlay("dependency graph") },
      ],
      overlays: [
        { id: "link task", kind: "modal", title: "Link a task", width: 560, render: ({ close, ...context }) => <DependencySelector context={context} close={close} />, footer: submitFooter("pj-dependency", "Save link") },
        { id: "duration edit", kind: "modal", title: "Change a duration", width: 480, render: ({ close, ...context }) => <DurationEdit context={context} close={close} /> },
        { id: "Date edit", kind: "modal", title: "Reschedule", width: 520, render: ({ close, ...context }) => <DateEdit context={context} close={close} />, footer: submitFooter("pj-dates", "Save dates") },
        { id: "conflict review", kind: "drawer", title: "Scheduling conflicts", width: 520, render: ({ ...context }) => <ConflictReview context={context} /> },
        { id: "dependency graph", kind: "drawer", title: "What waits for what", width: 520, render: ({ ...context }) => <DependencyGraph context={context} /> },
      ],
    },

    "ARL-PROJECT-007": {
      id: "ARL-PROJECT-007",
      subtitle: () => "People and AI employees modelled separately, because they are not the same.",
      tabs: (["People", "AI", "Departments", "Calendar"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Workload context={context} lens={lens} />,
      })),
      actions: [
        { id: "Reassign", label: "Reassign", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a task first"), run: (context) => context.openOverlay("allocation editor") },
        { id: "view capacity", label: "View who is over capacity", placement: "secondary", run: (context) => context.openOverlay("over-capacity alert") },
        { id: "adjust estimates", label: "Adjust an estimate", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a task first"), run: (context) => context.openOverlay("allocation editor") },
      ],
      overlays: [
        { id: "Workload detail", kind: "drawer", title: "What this person holds", width: 520, render: ({ ...context }) => <WorkloadDetail context={context} /> },
        { id: "allocation editor", kind: "modal", title: "Owner and estimate", width: 520, render: ({ close, ...context }) => <AllocationEditor context={context} close={close} />, footer: submitFooter("pj-allocation", "Save") },
        { id: "over-capacity alert", kind: "drawer", title: "Over capacity", width: 480, render: ({ ...context }) => <OverCapacity context={context} /> },
      ],
    },

    "ARL-PROJECT-008": {
      id: "ARL-PROJECT-008",
      subtitle: () => "Reusable phases and tasks. A clone never inherits confidential attachments.",
      tabs: (["Company", "Industry", "Personal"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Templates context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create", label: "Create a template", placement: "primary", run: (context) => context.openOverlay("Template editor") },
        { id: "apply", label: "Apply a template", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => context.openOverlay("preview") },
        { id: "duplicate", label: "Duplicate", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => duplicateTemplate(context) },
        { id: "publish", label: "Publish a revision", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => context.openOverlay("revision confirm") },
        { id: "edit", label: "Edit", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose a template first"), run: (context) => context.openOverlay("Template editor", { id: context.selectedId }) },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Template editor", kind: "modal", title: "Template", width: 620, render: ({ close, ...context }) => <TemplateEditor context={context} close={close} />, footer: submitFooter("pj-template", "Save template") },
        { id: "preview", kind: "modal", title: "Apply this template", width: 600, render: ({ close, ...context }) => <TemplatePreview context={context} close={close} /> },
        { id: "revision confirm", kind: "modal", title: "Publish a revision", tone: "danger", width: 520, render: ({ close, ...context }) => <RevisionConfirm context={context} close={close} /> },
      ],
    },

    "ARL-PROJECT-009": {
      id: "ARL-PROJECT-009",
      subtitle: () => "Objectives with a measure, a target and a check-in somebody wrote.",
      tabs: (["Company", "Team", "Personal", "Check-ins"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <Goals context={context} lens={lens} />,
      })),
      actions: [
        { id: "report progress", label: "Report progress", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Choose an objective first"), run: (context) => context.openOverlay("check-in dialog") },
        { id: "Set target", label: "Set a target", placement: "secondary", run: (context) => context.openOverlay("goal revision") },
        { id: "link project", label: "Link a project", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose an objective first"), run: (context) => context.openOverlay("link project") },
        { id: "metric source", label: "Where a number comes from", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Choose an objective first"), run: (context) => context.openOverlay("Metric source") },
      ],
      overlays: [
        { id: "link project", kind: "modal", title: "Link projects to this objective", width: 520, render: ({ close, ...context }) => <LinkProject context={context} close={close} /> },
        { id: "Metric source", kind: "drawer", title: "Where this number comes from", width: 520, render: ({ ...context }) => <MetricSource context={context} /> },
        { id: "check-in dialog", kind: "modal", title: "Check in", width: 540, render: ({ close, ...context }) => <CheckInDialog context={context} close={close} />, footer: submitFooter("pj-checkin", "Record check-in") },
        { id: "goal revision", kind: "modal", title: "Objective", width: 560, render: ({ close, ...context }) => <GoalRevision context={context} close={close} />, footer: submitFooter("pj-goal", "Save objective") },
      ],
    },

    "ARL-PROJECT-010": {
      id: "ARL-PROJECT-010",
      subtitle: () => "Hours a person recorded, and what they cost. Agent compute is not in here.",
      tabs: (["My time", "Team", "Costs", "Approvals"] as const).map((lens) => ({
        id: lens, render: (context: ScreenContext) => <TimeAndCost context={context} lens={lens} />,
      })),
      actions: [
        { id: "Log time", label: "Log time", placement: "primary", run: (context) => context.openOverlay("Timer") },
        { id: "approve", label: "Approve time", placement: "secondary", run: (context) => approveHours(context) },
        { id: "edit", label: "Correct an entry", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select an entry first"), run: (context) => context.openOverlay("timesheet correction") },
        { id: "export", label: "Export timesheets", placement: "overflow", capability: "export_data", run: (context) => exportTime(context) },
        { id: "billing", label: "Billable time", placement: "overflow", run: (context) => context.openOverlay("billing link") },
      ],
      overlays: [
        ...kitOverlays,
        { id: "Timer", kind: "modal", title: "Log time", width: 520, render: ({ close, ...context }) => <TimerOverlay context={context} close={close} />, footer: submitFooter("pj-timer", "Save entry") },
        { id: "timesheet correction", kind: "modal", title: "Correct a time entry", width: 520, render: ({ close, ...context }) => <TimesheetCorrection context={context} close={close} />, footer: submitFooter("pj-correction", "Save correction") },
        { id: "billing link", kind: "drawer", title: "Billable time", width: 480, render: ({ ...context }) => <BillingLink context={context} /> },
      ],
    },
  },
});

function CompletionCheck({ context, close }: { context: ScreenContext; close: () => void }) {
  const task = useRecord(context.params.id ?? context.selectedId);
  const data = useProjectData();
  if (!task) return <Empty title="No task" />;
  const checklist = (task.body as { checklist?: { label: string; done: boolean }[] } | undefined)?.checklist ?? [];
  const unticked = checklist.filter((item) => !item.done);
  const blockers = String(task.fields.dependsOn ?? "").split(",").filter(Boolean)
    .map((id) => data.tasks.find((row) => row.id === id))
    .filter((row): row is Rec => Boolean(row) && stageOf(row!) !== "done");
  return (
    <Stack gap={4}>
      <h3>{task.title}</h3>
      <Properties rows={[
        { label: "Checklist", value: `${checklist.length - unticked.length} of ${checklist.length} ticked` },
        { label: "Waiting on", value: blockers.length ? blockers.map((row) => row.title).join(", ") : "Nothing" },
        { label: "Time logged", value: `${data.shifts.filter((entry) => entry.fields.taskId === task.id).reduce((sum, entry) => sum + Number(entry.fields.hours ?? 0), 0)} hours` },
      ]} />
      {blockers.length > 0 && <Notice tone="danger" title="This task depends on unfinished work">Completing it now would say something finished that has not.</Notice>}
      {unticked.length > 0 && blockers.length === 0 && <Notice tone="warning" title={`${unticked.length} checklist items are not ticked`}>{unticked.map((item) => item.label).join("; ")}.</Notice>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={blockers.length > 0}
          onClick={async () => {
            await context.mutate.patch(task.id, { status: "done", fields: { ...task.fields, stage: "done", completedBy: context.actor } }, { expectRevision: task.revision, event: `${task.title} completed by ${context.actor}` });
            context.toast("Task complete", "The stage changed on the record, with your name against it.");
            close();
          }}
        >
          Mark complete
        </Button>
      </Row>
    </Stack>
  );
}
