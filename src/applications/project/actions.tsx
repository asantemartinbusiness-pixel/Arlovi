import { useState, useSyncExternalStore } from "react";
import { Button, Checkbox, DataGrid, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollections, useEvents, useRecord } from "@/platform/workspace";
import { listByCollection } from "@/platform/repo";
import type { Rec } from "@/domain/types";
import { askFirst, Boundary, logBoundary, selectedOf } from "@/applications/hr/opsKit";
import { LANES, stageOf, type LaneId } from "./board";
import { clockIso } from "@/platform/clock";
import { duplicateProjectPlan, nextProjectCopyTitle } from "./creation";
import { positiveHours, taskMoveDecision } from "./progression";

/* ------------------------------------------------------------------ *
 * Contract actions for the Projects module that change records.
 * ------------------------------------------------------------------ */

function store<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    set(next: T) { value = next; listeners.forEach((listener) => listener()); },
    use(): T { return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => value); },
  };
}

const dependenciesOf = (task: Rec) => String(task.fields.dependsOn ?? "").split(",").filter(Boolean);
const ownTasks = (tasks: Rec[], projectId: string) => tasks.filter((task) => task.parentId === projectId && task.fields.kind !== "onboarding");

/* ---------------- ARL-PROJECT-001 · filter / report ---------------- */

export interface PortfolioFilterValue { programme: string; health: string }
export const portfolioFilter = store<PortfolioFilterValue>({ programme: "", health: "" });

export function matchesPortfolio(project: Rec, filter: PortfolioFilterValue): boolean {
  return (!filter.programme || String(project.fields.programme ?? "") === filter.programme)
    && (!filter.health || String(project.fields.health ?? "") === filter.health);
}

export function PortfolioFilterNotice({ total, shown }: { total: number; shown: number }) {
  const filter = portfolioFilter.use();
  if (!filter.programme && !filter.health) return null;
  return (
    <Notice tone="info" title={`Filtered: ${[filter.programme, filter.health.replace("_", " ")].filter(Boolean).join(" · ")}`}>
      <Row gap={2}><span className="ds-grow">{shown} of {total} projects shown.</span><Button size="sm" variant="ghost" onClick={() => portfolioFilter.set({ programme: "", health: "" })}>Clear the filter</Button></Row>
    </Notice>
  );
}

function reportRows(projects: Rec[], tasks: Rec[]) {
  const seen = new Set<string>();
  return projects.map((project) => {
    // A task is counted once across the whole report, even if linked elsewhere.
    const own = ownTasks(tasks, project.id).filter((task) => {
      const key = String(task.fields.linkedTaskId ?? task.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      id: project.id,
      project: project.title,
      health: String(project.fields.health ?? "unknown"),
      tasks: own.length,
      done: own.filter((task) => stageOf(task) === "done").length,
      budgetMinor: Number(project.fields.budgetMinor ?? 0),
      spentMinor: Number(project.fields.spentMinor ?? 0),
    };
  });
}

export function PortfolioReport({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["projects", "tasks"]);
  const filter = portfolioFilter.use();
  const projects = data.projects.filter((project) => project.status !== "archived" && matchesPortfolio(project, filter));
  const rows = reportRows(projects, data.tasks);
  const totals = rows.reduce((sum, row) => ({ tasks: sum.tasks + row.tasks, done: sum.done + row.done, budget: sum.budget + row.budgetMinor, spent: sum.spent + row.spentMinor }), { tasks: 0, done: 0, budget: 0, spent: 0 });
  return (
    <Stack gap={4}>
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label="Portfolio report"
        filterable={false}
        columns={[
          { key: "project", header: "Project", primary: true, cell: (row) => row.project },
          { key: "health", header: "Health", cell: (row) => <Pill>{row.health.replace("_", " ")}</Pill> },
          { key: "tasks", header: "Done", align: "end", cell: (row) => <span className="ds-num">{row.done} / {row.tasks}</span> },
          { key: "spent", header: "Spent / budget", align: "end", cell: (row) => <span className="ds-num">{context.money(row.spentMinor)} / {context.money(row.budgetMinor)}</span> },
        ]}
      />
      <Properties rows={[
        { label: "Projects", value: String(rows.length) },
        { label: "Tasks, each counted once", value: `${totals.done} of ${totals.tasks} done` },
        { label: "Spent of budget", value: `${context.money(totals.spent)} of ${context.money(totals.budget)}` },
      ]} />
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Close</Button>
        <Button
          variant="secondary"
          onClick={() => {
            const csv = ["project,health,tasks,done,budget,spent", ...rows.map((row) => [row.project, row.health, row.tasks, row.done, row.budgetMinor / 100, row.spentMinor / 100].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `${context.org.slug}-portfolio-report.csv`;
            link.click();
            URL.revokeObjectURL(url);
            context.toast("CSV downloaded", "The report file was made in this browser.");
          }}
        >
          Download CSV
        </Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          onClick={async () => {
            await context.mutate.create({
              collection: "reports",
              title: `Portfolio report · ${context.date(context.now)}`,
              status: "saved",
              summary: `${rows.length} projects, ${totals.tasks} tasks counted once, ${context.money(totals.spent)} spent of ${context.money(totals.budget)}.`,
              fields: { kind: "portfolio", projects: rows.length, tasks: totals.tasks, done: totals.done, budgetMinor: totals.budget, spentMinor: totals.spent, filter: [filter.programme, filter.health].filter(Boolean).join(" · ") || "none" },
              body: { rows },
            }, `Portfolio report saved by ${context.actor}`);
            context.toast("Report saved", "A dated snapshot of the portfolio is kept as a report record.");
            close();
          }}
        >
          Save the report
        </Button>
      </Row>
    </Stack>
  );
}

/* ---------------- ARL-PROJECT-002 · duplicate / pin ---------------- */

export async function duplicateProject(context: ScreenContext): Promise<void> {
  const project = await selectedOf(context, "projects", "a project");
  if (!project) return;
  const [allTasks, allProjects] = await Promise.all([
    listByCollection(context.org.id, "tasks"),
    listByCollection(context.org.id, "projects"),
  ]);
  const tasks = ownTasks(allTasks, project.id);
  const proposed = nextProjectCopyTitle(project.title, allProjects.map((item) => item.title));
  askFirst(context, {
    title: `Duplicate ${project.title}`,
    body: `Creates ${proposed} with ${tasks.length} backlog tasks and internal dependency links. Existing assignees, approvals, review history, AI delegation, worklogs, comments and attachments are not copied. The entire copy is saved together.`,
    confirm: "Duplicate the project",
    run: async () => {
      try {
        const plan = duplicateProjectPlan({
          organizationId: context.org.id, currency: context.org.currency,
          actor: context.actor, now: new Date(clockIso()),
        }, project, tasks, proposed);
        await context.mutate.putMany(plan.records, plan.messages, plan.expectedRevisions, plan.eventTypes);
        context.toast("Project duplicated",
          `${plan.project.title} has ${plan.tasks.length} new backlog tasks. All dependencies point to copied tasks in this project.`);
        context.select(plan.project.id);
        context.navigate(`/o/${context.org.slug}/project/projects/${plan.project.id}`);
      } catch (error) {
        context.toast("Project was not duplicated",
          error instanceof Error ? error.message : "The source changed. Reopen this project and retry.", "failed");
      }
    },
  });
}

export function pinnedBy(project: Rec): string[] {
  return String(project.fields.pinnedBy ?? "").split(",").filter(Boolean);
}

export async function togglePin(context: ScreenContext): Promise<void> {
  const project = await selectedOf(context, "projects", "a project");
  if (!project) return;
  const current = pinnedBy(project);
  const pinned = current.includes(context.actor);
  const next = pinned ? current.filter((name) => name !== context.actor) : [...current, context.actor];
  await context.mutate.patch(project.id, { fields: { ...project.fields, pinnedBy: next.join(",") } }, { expectRevision: project.revision, event: `${project.title} ${pinned ? "unpinned" : "pinned"} by ${context.actor}` });
  context.toast(pinned ? "Unpinned" : "Pinned", `${project.title} is ${pinned ? "no longer" : "now"} on ${context.actor}'s Following tab.`);
}

/* ---------------- ARL-PROJECT-003 · status / update / owner / file ---------------- */

export function ChangeStatus({ context, close }: { context: ScreenContext; close: () => void }) {
  const project = useRecord(context.params.id);
  const [status, setStatus] = useState("");
  if (!project) return <Empty title="Open a project first" />;
  const value = status || project.status;
  return (
    <form
      id="pj-change-status"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const reason = String(new FormData(event.currentTarget).get("reason") ?? "");
        if (value === project.status) return;
        const pausing = value === "paused";
        await context.mutate.patch(project.id, {
          status: value,
          fields: { ...project.fields, automationPaused: pausing ? true : value === "active" ? false : project.fields.automationPaused, statusReason: reason },
        }, { expectRevision: project.revision, event: `${project.title} status changed from ${project.status} to ${value} by ${context.actor}${reason ? `: ${reason}` : ""}` });
        context.toast("Status changed", pausing ? "Paused. Automation configured on this project stopped; tasks and time entries are untouched." : `${project.title} is now ${value}.`);
        close();
      }}
    >
      <Field label="Status">
        <Select value={value} onChange={(event) => setStatus(event.target.value)}>
          {["planning", "active", "paused", "done"].map((option) => <option key={option}>{option}</option>)}
        </Select>
      </Field>
      <Field label="Why" hint="Recorded with the change."><TextArea name="reason" rows={2} /></Field>
      {value === "paused" && (
        <Notice tone="warning" title="What pausing does">
          Automation configured on this project stops. Tasks stay where they are, people can keep working and logging time,
          and automation on other projects is untouched.
        </Notice>
      )}
      {value === project.status && <Notice tone="info">Choose a different status to change it.</Notice>}
    </form>
  );
}

export function requestUpdate(context: ScreenContext, project: Rec | undefined): void {
  if (!project) { context.toast("Open a project first", "Nothing was requested.", "blocked"); return; }
  const due = new Date(context.now.getTime() + 3 * 86_400_000);
  askFirst(context, {
    title: "Request a status update",
    body: `Asks ${project.ownerName}, the project owner, for a written update on ${project.title} by ${context.date(due)}. The request is recorded in this workspace; no notification leaves the browser.`,
    confirm: `Request it from ${project.ownerName}`,
    run: async () => {
      const request = await context.mutate.create({
        collection: "updateRequests", title: `Status update for ${project.title}`, status: "requested",
        summary: `Requested by ${context.actor}.`, parentId: project.id, dueAt: due.toISOString(),
        fields: { requestedBy: context.actor, requestedOf: project.ownerName, projectId: project.id },
      }, `${context.actor} requested a status update on ${project.title} from ${project.ownerName}`);
      await context.mutate.patch(project.id, { fields: { ...project.fields, updateRequestedAt: clockIso(), updateRequestedOf: project.ownerName } }, { expectRevision: project.revision, event: `Update requested from ${project.ownerName}` });
      await logBoundary(context, "email.send", `Update request notification for ${project.ownerName} kept locally`, request.id);
      context.toast("Update requested", `${project.ownerName} owes an update by ${context.date(due)}.`);
    },
  });
}

export function AssignOwner({ context, close }: { context: ScreenContext; close: () => void }) {
  const project = useRecord(context.params.id);
  const data = useCollections(["employees"]);
  if (!project) return <Empty title="Open a project first" />;
  return (
    <form
      id="pj-owner"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const owner = String(new FormData(event.currentTarget).get("owner") ?? "");
        if (!owner || owner === project.ownerName) return;
        await context.mutate.patch(project.id, { ownerName: owner, fields: { ...project.fields, owner, previousOwner: project.ownerName } }, { expectRevision: project.revision, event: `${project.title} owner changed from ${project.ownerName} to ${owner} by ${context.actor}` });
        context.toast("Owner assigned", `${owner} owns ${project.title}. ${project.ownerName}'s earlier changes keep their attribution.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Current owner", value: project.ownerName }]} />
      <Field label="New owner" required>
        <Select name="owner" required defaultValue="">
          <option value="">Choose a person</option>
          {data.employees.filter((row) => row.status !== "alumni" && row.title !== project.ownerName).map((row) => <option key={row.id}>{row.title}</option>)}
        </Select>
      </Field>
      <Notice tone="info">An AI employee cannot own a project; a named person is accountable for it.</Notice>
    </form>
  );
}

export function AttachFile({ context, close }: { context: ScreenContext; close: () => void }) {
  const project = useRecord(context.params.id);
  const [file, setFile] = useState<File | null>(null);
  if (!project) return <Empty title="Open a project first" />;
  return (
    <form
      id="pj-attach"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = file?.name ?? String(form.get("name") ?? "").trim();
        if (!name) return;
        await context.mutate.create({
          collection: "documents", title: name, status: "attached",
          summary: String(form.get("note") ?? "") || `Attached to ${project.title} by ${context.actor}.`,
          parentId: project.id,
          fields: { kind: "projectAttachment", projectId: project.id, sizeBytes: file?.size ?? 0, mime: file?.type ?? "", confidential: form.get("confidential") === "on", stored: "metadata only" },
        }, `${name} attached to ${project.title} by ${context.actor}`);
        context.toast("File attached", `${name} is recorded against ${project.title}. Only its name and size are kept in this browser.`);
        close();
      }}
    >
      <Field label="File"><input type="file" aria-label="Choose a file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>
      {!file && <Field label="Or name a file kept elsewhere"><TextInput name="name" placeholder="Supplier quote.pdf" /></Field>}
      <Field label="Note"><TextArea name="note" rows={2} /></Field>
      <Checkbox name="confidential" label="Confidential — never copied when the project is cloned" />
      <Notice tone="info" title="Nothing is uploaded">No storage provider is connected. The record keeps the file's name, size and type; the file itself stays where it is.</Notice>
    </form>
  );
}

/* ---------------- ARL-PROJECT-004 · create / drag / filter ---------------- */

export function NewTask({ context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["projects", "employees"]);
  const project = data.projects.find((row) => row.id === context.params.id) ?? data.projects.find((row) => row.status !== "archived");
  if (!project) return <Empty title="No project to add a task to" />;
  return (
    <form
      id="pj-new-task"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "").trim();
        if (!title) return;
        const due = String(form.get("due") ?? "");
        const end = due ? new Date(`${due}T17:00:00.000Z`) : new Date(context.now.getTime() + 7 * 86_400_000);
        const created = await context.mutate.create({
          collection: "tasks", title, status: String(form.get("stage") ?? "backlog"), summary: String(form.get("summary") ?? ""),
          parentId: project.id, startAt: context.now.toISOString(), endAt: end.toISOString(), dueAt: end.toISOString(),
          fields: { stage: String(form.get("stage") ?? "backlog"), assignee: String(form.get("assignee") ?? context.actor), priority: String(form.get("priority") ?? "normal"), estimateHours: Number(form.get("estimate") ?? 4), loggedHours: 0, sprint: "", kind: "task", dependsOn: "", delegatedToAgent: false },
        }, `Task created on ${project.title}: ${title}`);
        context.select(created.id);
        context.toast("Task created", `${title} is on the ${project.title} board.`);
        close();
      }}
    >
      <Properties rows={[{ label: "Project", value: project.title }]} />
      <Field label="Task" required><TextInput name="title" required /></Field>
      <Field label="Detail"><TextArea name="summary" rows={2} /></Field>
      <Row gap={3}>
        <Field label="Stage"><Select name="stage" defaultValue="backlog">{LANES.filter((lane) => lane.id !== "done").map((lane) => <option key={lane.id} value={lane.id}>{lane.label}</option>)}</Select></Field>
        <Field label="Priority"><Select name="priority" defaultValue="normal">{["low", "normal", "high"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
      </Row>
      <Row gap={3}>
        <Field label="Owner"><Select name="assignee" defaultValue={context.actor}>{data.employees.filter((row) => row.status !== "alumni").map((row) => <option key={row.id}>{row.title}</option>)}</Select></Field>
        <Field label="Estimate (hours)"><TextInput name="estimate" inputMode="numeric" align="end" defaultValue="4" /></Field>
      </Row>
      <Field label="Due"><TextInput type="date" name="due" /></Field>
    </form>
  );
}

export function MoveTask({ context, close }: { context: ScreenContext; close: () => void }) {
  const task = useRecord(context.selectedId);
  const data = useCollections(["tasks"]);
  const [lane, setLane] = useState<LaneId | "">("");
  if (!task || task.collection !== "tasks") return <Empty title="Select a card on the board first" />;
  const decision = lane ? taskMoveDecision(task, lane, data.tasks) : undefined;
  const blockedByDeps = Boolean(decision?.blocked);
  const skipsReview = Boolean(decision?.needsReviewDecision);
  return (
    <Stack gap={4}>
      <h3>{task.title}</h3>
      <Field label={`Move from ${stageOf(task)} to`}>
        <Select value={lane} onChange={(event) => setLane(event.target.value as LaneId)}>
          <option value="">Choose a stage</option>
          {LANES.filter((item) => item.id !== stageOf(task)).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      {blockedByDeps && <Notice tone="danger" title="Task move blocked">{decision?.blocked}</Notice>}
      {skipsReview && <Notice tone="warning" title="This skips Review">High priority work goes through Review. Continuing opens the stage rule so the skip is a recorded decision.</Notice>}
      <Notice tone="info">Moving a card changes its stage only. No automation or external side effect runs from a stage change.</Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={!lane || blockedByDeps}
          onClick={async () => {
            if (!lane) return;
            if (skipsReview) { context.openOverlay("stage rule", { id: task.id, lane }); return; }
            const saved = await context.mutate.patch(task.id, {
              status: lane, fields: { ...task.fields, stage: lane },
            }, { expectRevision: task.revision, event: `${task.title} moved to ${lane} by ${context.actor}` });
            if (!saved) return;
            context.toast("Task moved", `${task.title} is in ${lane}.`);
            close();
          }}
        >
          Move the task
        </Button>
      </Row>
    </Stack>
  );
}

export interface BoardFilterValue { assignee: string; priority: string }
export const boardFilter = store<BoardFilterValue>({ assignee: "", priority: "" });

export function matchesBoard(task: Rec, filter: BoardFilterValue): boolean {
  return (!filter.assignee || String(task.fields.assignee ?? task.ownerName) === filter.assignee)
    && (!filter.priority || String(task.fields.priority ?? "normal") === filter.priority);
}

export function BoardFilter({ context: _context, close }: { context: ScreenContext; close: () => void }) {
  const data = useCollections(["tasks"]);
  const current = boardFilter.use();
  const [value, setValue] = useState(current);
  const owners = [...new Set(data.tasks.filter((task) => task.fields.kind !== "onboarding").map((task) => String(task.fields.assignee ?? task.ownerName)))].filter(Boolean).sort();
  return (
    <Stack gap={4}>
      <Field label="Owner"><Select value={value.assignee} onChange={(event) => setValue({ ...value, assignee: event.target.value })}><option value="">Anyone</option>{owners.map((owner) => <option key={owner}>{owner}</option>)}</Select></Field>
      <Field label="Priority"><Select value={value.priority} onChange={(event) => setValue({ ...value, priority: event.target.value })}><option value="">Any</option>{["low", "normal", "high"].map((option) => <option key={option}>{option}</option>)}</Select></Field>
      <Row gap={2}>
        <Button variant="ghost" onClick={() => { boardFilter.set({ assignee: "", priority: "" }); close(); }}>Clear</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={() => { boardFilter.set(value); close(); }}>Apply the filter</Button>
      </Row>
    </Stack>
  );
}

export function BoardFilterNotice({ total, shown }: { total: number; shown: number }) {
  const filter = boardFilter.use();
  if (!filter.assignee && !filter.priority) return null;
  return (
    <Notice tone="info" title={`Filtered: ${[filter.assignee, filter.priority && `${filter.priority} priority`].filter(Boolean).join(" · ")}`}>
      <Row gap={2}><span className="ds-grow">{shown} of {total} tasks shown.</span><Button size="sm" variant="ghost" onClick={() => boardFilter.set({ assignee: "", priority: "" })}>Clear the filter</Button></Row>
    </Notice>
  );
}

/* ---------------- ARL-PROJECT-005 · edit / comment / delegate ---------------- */

export function TaskEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const task = useRecord(context.params.id);
  if (!task) return <Empty title="Open a task first" />;
  return (
    <form
      id="pj-task-edit"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const title = String(form.get("title") ?? "").trim();
        if (!title) return;
        const due = String(form.get("due") ?? "");
        let estimate: number;
        try {
          estimate = positiveHours(form.get("estimate") ?? task.fields.estimateHours ?? 0);
        } catch (error) {
          context.toast("Check estimated hours", error instanceof Error ? error.message : "Use a valid non-negative number.", "blocked");
          return;
        }
        const saved = await context.mutate.patch(task.id, {
          title,
          summary: String(form.get("summary") ?? ""),
          dueAt: due ? new Date(`${due}T17:00:00.000Z`).toISOString() : task.dueAt,
          fields: { ...task.fields, priority: String(form.get("priority") ?? "normal"), estimateHours: estimate },
        }, { expectRevision: task.revision, event: `${task.title} edited by ${context.actor}` });
        if (!saved) return;
        context.toast("Task saved", "The earlier version is kept in the task's history with its author.");
        close();
      }}
    >
      <Field label="Task" required><TextInput name="title" required defaultValue={task.title} /></Field>
      <Field label="Description"><TextArea name="summary" rows={3} defaultValue={task.summary} /></Field>
      <Row gap={3}>
        <Field label="Priority"><Select name="priority" defaultValue={String(task.fields.priority ?? "normal")}>{["low", "normal", "high"].map((value) => <option key={value}>{value}</option>)}</Select></Field>
        <Field label="Estimate (hours)"><TextInput name="estimate" inputMode="numeric" align="end" defaultValue={String(task.fields.estimateHours ?? 0)} /></Field>
        <Field label="Due"><TextInput type="date" name="due" defaultValue={(task.dueAt ?? "").slice(0, 10)} /></Field>
      </Row>
      <Notice tone="info">The owner is changed with Reassign, so the change of owner is its own recorded event.</Notice>
    </form>
  );
}

export function CommentForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const task = useRecord(context.params.id);
  const [text, setText] = useState("");
  if (!task) return <Empty title="Open a task first" />;
  return (
    <form
      id="pj-comment"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!text.trim()) return;
        await context.mutate.log(`${context.actor} on ${task.title}: ${text.trim()}`, { entityId: task.id, type: "comment" });
        context.toast("Comment recorded", "It is on the Discussion tab, attributed to you.");
        close();
      }}
    >
      <Field label={`Comment on ${task.title}`} required><TextArea rows={4} value={text} onChange={(event) => setText(event.target.value)} required /></Field>
    </form>
  );
}

/** Discussion tab body: the comments actually recorded against the task. */
export function TaskComments({ context, taskId }: { context: ScreenContext; taskId: string }) {
  const comments = useEvents(taskId).filter((event) => event.type === "comment");
  return (
    <Stack gap={3}>
      {comments.length === 0 && <span className="ds-subtle">Nothing has been written against this task yet.</span>}
      {comments.map((comment) => (
        <div key={comment.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
          <Row gap={2}><strong className="ds-grow">{comment.actor}</strong><span className="ds-subtle">{context.dateTime(comment.at)}</span></Row>
          <p>{comment.message.replace(/^.*? on .*?: /, "")}</p>
        </div>
      ))}
    </Stack>
  );
}

export function DelegateAI({ context, close }: { context: ScreenContext; close: () => void }) {
  const task = useRecord(context.params.id);
  const members = useCollections(["members"]).members.filter((row) => row.fields.kind === "ai");
  if (!task) return <Empty title="Open a task first" />;
  return (
    <form
      id="pj-delegate"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const agent = members.find((row) => row.id === String(new FormData(event.currentTarget).get("agent") ?? ""));
        if (!agent) return;
        await context.mutate.patch(task.id, { fields: { ...task.fields, assignee: agent.title, delegatedToAgent: true, delegatedBy: context.actor, accountable: context.actor } }, { expectRevision: task.revision, event: `${task.title} delegated to ${agent.title} by ${context.actor}, who stays accountable` });
        await logBoundary(context, "model.inference", `${agent.title} has ${task.title} queued; it does not run until a model is connected`, task.id);
        context.toast("Delegated", `${agent.title} holds the task; ${context.actor} stays accountable. No model is called from this browser.`);
        close();
      }}
    >
      {members.length === 0 ? <Empty title="No AI employees in this workspace" /> : (
        <Field label="AI employee" required>
          <Select name="agent" required defaultValue="">
            <option value="">Choose an AI employee</option>
            {members.map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
          </Select>
        </Field>
      )}
      <Properties rows={[{ label: "Accountable person", value: context.actor }, { label: "Currently with", value: String(task.fields.assignee ?? task.ownerName) }]} />
      <Notice tone="warning" title="The agent cannot finish this on its own">It drafts and records evidence; it cannot move the task past Review.</Notice>
      <Boundary id="model.inference" />
    </form>
  );
}

/* ---------------- ARL-PROJECT-006 · duration ---------------- */

export function DurationEdit({ context, close }: { context: ScreenContext; close: () => void }) {
  const task = useRecord(context.selectedId);
  const data = useCollections(["tasks"]);
  const current = task?.startAt && task.endAt ? Math.max(0, Math.round((new Date(task.endAt).getTime() - new Date(task.startAt).getTime()) / 86_400_000)) : 0;
  const [days, setDays] = useState(String(current));
  if (!task || task.collection !== "tasks" || !task.startAt) return <Empty title="Pick a bar on the timeline first" />;
  const value = Number(days);
  const invalid = !Number.isFinite(value) || value < 0;
  const end = new Date(new Date(task.startAt).getTime() + (invalid ? 0 : value) * 86_400_000);
  const pushed = data.tasks.filter((row) => dependenciesOf(row).includes(task.id) && row.startAt && new Date(row.startAt) < end);
  return (
    <Stack gap={4}>
      <h3>{task.title}</h3>
      <Field label="Duration in days"><TextInput inputMode="numeric" align="end" value={days} onChange={(event) => setDays(event.target.value)} invalid={invalid} /></Field>
      <Properties rows={[
        { label: "Starts", value: context.date(task.startAt) },
        { label: "Ends now", value: context.date(task.endAt) },
        { label: "Would end", value: invalid ? "—" : context.date(end) },
      ]} />
      {pushed.length > 0 && <Notice tone="danger" title="Dependent work would start before this ends">{pushed.map((row) => `${row.title} starts ${context.date(row.startAt)}`).join("; ")}. Move those first; an impossible order is refused.</Notice>}
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button
          variant="primary"
          disabled={invalid || pushed.length > 0 || value === current}
          onClick={async () => {
            await context.mutate.patch(task.id, { endAt: end.toISOString(), dueAt: end.toISOString() }, { expectRevision: task.revision, event: `${task.title} duration changed from ${current} to ${value} days by ${context.actor}` });
            context.toast("Duration changed", `${task.title} now ends ${context.date(end)}.`);
            close();
          }}
        >
          Change the duration
        </Button>
      </Row>
    </Stack>
  );
}

/* ---------------- ARL-PROJECT-008 · duplicate template ---------------- */

export async function duplicateTemplate(context: ScreenContext): Promise<void> {
  const template = await selectedOf(context, "templates", "a template");
  if (!template) return;
  askFirst(context, {
    title: `Duplicate ${template.title}`,
    body: "Creates a draft copy of the template's phases and tasks. The original and every project built from it are untouched.",
    confirm: "Duplicate the template",
    run: async () => {
      const copy = await context.mutate.create({ collection: "templates", title: `${template.title} (copy)`, status: "draft", summary: template.summary, fields: { ...template.fields, duplicatedFrom: template.id, revisedBy: "" }, body: template.body }, `${template.title} duplicated by ${context.actor}`);
      context.select(copy.id);
      context.toast("Template duplicated", `${copy.title} is a draft until it is published.`);
    },
  });
}

/* ---------------- ARL-PROJECT-009 · link project ---------------- */

export function LinkProject({ context, close }: { context: ScreenContext; close: () => void }) {
  const objective = useRecord(context.selectedId);
  const projects = useCollections(["projects"]).projects.filter((row) => row.status !== "archived");
  const [ids, setIds] = useState<string[]>(String(objective?.fields.projectIds ?? "").split(",").filter(Boolean));
  if (!objective || objective.collection !== "objectives") return <Empty title="Choose an objective first" />;
  return (
    <Stack gap={4}>
      <h3>{objective.title}</h3>
      <fieldset className="ds-stack ds-gap-2" style={{ border: 0, padding: 0 }}>
        <legend className="ds-subtle">Projects that contribute</legend>
        {projects.map((project) => (
          <Checkbox key={project.id} label={project.title} checked={ids.includes(project.id)} onChange={(event) => setIds((current) => event.target.checked ? [...current, project.id] : current.filter((id) => id !== project.id))} />
        ))}
      </fieldset>
      <Notice tone="info">Linking says which work contributes. Progress still comes from a person's check-in, never from the linked projects' task counts.</Notice>
      <Row gap={2}>
        <Button variant="ghost" onClick={close}>Cancel</Button>
        <span className="ds-grow" />
        <Button variant="primary" onClick={async () => {
          await context.mutate.patch(objective.id, { fields: { ...objective.fields, projectIds: ids.join(",") } }, { expectRevision: objective.revision, event: `${objective.title} linked to ${ids.length} project${ids.length === 1 ? "" : "s"} by ${context.actor}` });
          context.toast("Projects linked", `${objective.title} lists ${ids.length} contributing project${ids.length === 1 ? "" : "s"}.`);
          close();
        }}>Save the links</Button>
      </Row>
    </Stack>
  );
}

/* ---------------- ARL-PROJECT-010 · export ---------------- */

export async function exportTime(context: ScreenContext): Promise<void> {
  const [shifts, members] = await Promise.all([listByCollection(context.org.id, "shifts"), listByCollection(context.org.id, "members")]);
  const agents = new Set(members.filter((row) => row.fields.kind === "ai").map((row) => row.title));
  const entries = shifts.filter((row) => row.fields.kind === "time" && !agents.has(String(row.fields.employeeName ?? "")));
  const csv = ["date,person,hours,billable,approved,rate,against", ...entries.map((row) => [row.startAt ?? "", String(row.fields.employeeName ?? ""), String(row.fields.hours ?? 0), String(row.fields.billable === true), String(row.fields.approved === true), Number(row.fields.rateMinor ?? 0) / 100, row.summary].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${context.org.slug}-timesheets.csv`;
  link.click();
  URL.revokeObjectURL(url);
  await context.mutate.log(`Timesheets exported by ${context.actor}: ${entries.length} people's entries; AI compute excluded`, { type: "export" });
  context.toast("Timesheets exported", `${entries.length} entries downloaded. AI employee work is not exported as billable hours.`);
}
