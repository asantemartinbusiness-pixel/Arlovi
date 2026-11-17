import type { Rec } from "@/domain/types";
import { newRecord } from "@/platform/repo";

/**
 * Project creation/duplication plans are prepared without persisting anything.
 * The caller saves every project and child task together with putMany; a
 * failed validation, stale source or transaction abort leaves no orphan work.
 */
export interface ProjectPhase { name: string; tasks: string[] }

export interface ProjectCreationPlan {
  project: Rec;
  tasks: Rec[];
  records: Rec[];
  messages: string[];
  expectedRevisions: Record<string, number>;
  eventTypes: ("create" | "update")[];
}

export interface CreationContext {
  organizationId: string;
  currency: string;
  actor: string;
  now: Date;
}

const DAY = 86_400_000;

function cleanTitle(title: string): string {
  const value = title.trim();
  if (!value) throw new Error("Enter a project name before creating it.");
  return value;
}

function checkContext(ctx: CreationContext): void {
  if (!ctx.organizationId || !ctx.currency || !ctx.actor.trim() || !Number.isFinite(ctx.now.getTime())) {
    throw new Error("A valid company, actor and creation date are required.");
  }
}

export function readProjectPhases(template: Rec | undefined): ProjectPhase[] {
  if (!template) return [];
  const body = template.body as { phases?: unknown } | undefined;
  if (!Array.isArray(body?.phases)) throw new Error("This template has no valid phase list. Edit the template before creating a project.");
  return body.phases.map((phase, index) => {
    if (!phase || typeof phase !== "object" || typeof phase.name !== "string"
      || !Array.isArray(phase.tasks) || phase.tasks.some((item: unknown) => typeof item !== "string" || !item.trim())) {
      throw new Error(`Template phase ${index + 1} is invalid; correct it before creating any records.`);
    }
    return { name: phase.name.trim() || `Phase ${index + 1}`, tasks: phase.tasks.map((name: string) => name.trim()) };
  });
}

export function nextProjectCopyTitle(source: string, existing: string[]): string {
  const taken = new Set(existing.map((title) => title.trim().toLocaleLowerCase()));
  const stem = cleanTitle(source).replace(/ \(copy(?: \d+)?\)$/i, "");
  let name = `${stem} (copy)`;
  let n = 2;
  while (taken.has(name.toLocaleLowerCase())) name = `${stem} (copy ${n++})`;
  return name;
}

function ctxStamp(ctx: CreationContext) {
  return { actor: ctx.actor, now: ctx.now.toISOString() };
}

export function createProjectFromTemplate(ctx: CreationContext, title: string, template?: Rec): ProjectCreationPlan {
  checkContext(ctx);
  const name = cleanTitle(title);
  if (template && (template.organizationId !== ctx.organizationId || template.collection !== "templates"
    || template.fields.kind !== "project" || template.status !== "published")) {
    throw new Error("Choose a published project template belonging to this company.");
  }
  const phases = readProjectPhases(template);
  const totalTasks = phases.reduce((count, phase) => count + phase.tasks.length, 0);
  const end = new Date(ctx.now.getTime() + Math.max(60, totalTasks * 3) * DAY);
  const project = newRecord({
    organizationId: ctx.organizationId, currency: ctx.currency, collection: "projects",
    title: name, status: "planning",
    summary: template ? `Created from the ${template.title} template.` : "Created from scratch.",
    startAt: ctx.now.toISOString(), endAt: end.toISOString(), dueAt: end.toISOString(),
    amountMinor: 0,
    fields: {
      health: "on_track", priority: "normal", programme: "Unassigned",
      budgetMinor: 0, spentMinor: 0, automationPaused: false,
      ...(template ? { templateId: template.id } : {}),
    },
  }, ctxStamp(ctx));
  const tasks: Rec[] = [];
  for (const phase of phases) {
    for (const label of phase.tasks) {
      const start = new Date(ctx.now.getTime() + tasks.length * 3 * DAY);
      const due = new Date(start.getTime() + 3 * DAY);
      tasks.push(newRecord({
        organizationId: ctx.organizationId, currency: ctx.currency, collection: "tasks",
        title: label, status: "backlog",
        summary: `${phase.name} phase${template ? `, from the ${template.title} template` : ""}.`,
        parentId: project.id,
        startAt: start.toISOString(), endAt: due.toISOString(), dueAt: due.toISOString(),
        fields: {
          stage: "backlog", assignee: ctx.actor, priority: "normal",
          estimateHours: 8, loggedHours: 0, sprint: phase.name, kind: "task",
          dependsOn: "", delegatedToAgent: false,
        },
      }, ctxStamp(ctx)));
    }
  }
  const records = [project, ...tasks];
  return {
    project, tasks, records,
    messages: [
      `Project created: ${name}`,
      ...tasks.map((task) => `Task ${task.title} created from project template ${template?.title ?? ""}`),
    ],
    expectedRevisions: template ? { [template.id]: template.revision } : {},
    eventTypes: records.map(() => "create" as const),
  };
}

function safeTaskFields(task: Rec, actor: string): Rec["fields"] {
  const estimate = Number(task.fields.estimateHours ?? 0);
  return {
    stage: "backlog",
    assignee: actor,
    priority: ["low", "normal", "high"].includes(String(task.fields.priority))
      ? String(task.fields.priority) : "normal",
    estimateHours: Number.isFinite(estimate) && estimate >= 0 ? estimate : 0,
    loggedHours: 0,
    sprint: String(task.fields.sprint ?? ""),
    kind: String(task.fields.kind ?? "task"),
    dependsOn: "",
    delegatedToAgent: false,
    sourceTaskId: task.id,
  };
}

export function duplicateProjectPlan(
  ctx: CreationContext, source: Rec, sourceTasks: Rec[], title: string,
): ProjectCreationPlan {
  checkContext(ctx);
  const name = cleanTitle(title);
  if (source.collection !== "projects" || source.organizationId !== ctx.organizationId) {
    throw new Error("The original project must belong to the selected company.");
  }
  if (sourceTasks.some((task) =>
    task.organizationId !== ctx.organizationId || task.collection !== "tasks" || task.parentId !== source.id)) {
    throw new Error("Source tasks contain an unrelated company or project. Nothing was duplicated.");
  }
  const project = newRecord({
    organizationId: ctx.organizationId, currency: ctx.currency, collection: "projects",
    title: name, status: "planning", summary: `Duplicated from ${source.title}.`,
    startAt: source.startAt, endAt: source.endAt, dueAt: source.dueAt, amountMinor: 0,
    fields: {
      health: "on_track", priority: String(source.fields.priority ?? "normal"),
      programme: String(source.fields.programme ?? "Unassigned"),
      budgetMinor: Number(source.fields.budgetMinor ?? 0), spentMinor: 0,
      automationPaused: false, pinnedBy: "", duplicatedFrom: source.id,
    },
  }, ctxStamp(ctx));
  const tasks = sourceTasks.map((task) => newRecord({
    organizationId: ctx.organizationId, currency: ctx.currency, collection: "tasks",
    title: task.title, status: "backlog", summary: task.summary,
    parentId: project.id, startAt: task.startAt, endAt: task.endAt, dueAt: task.dueAt,
    fields: safeTaskFields(task, ctx.actor),
  }, ctxStamp(ctx)));

  // Keep only same-project dependencies; rewriting references avoids pointing
  // at the original project or at tasks that were never copied.
  const rekey = new Map(sourceTasks.map((task, index) => [task.id, tasks[index].id]));
  for (const [index, task] of sourceTasks.entries()) {
    tasks[index].fields.dependsOn = String(task.fields.dependsOn ?? "").split(",")
      .map((id) => rekey.get(id.trim()))
      .filter((id): id is string => Boolean(id))
      .join(",");
  }
  const records = [project, ...tasks];
  return {
    project, tasks, records,
    messages: [
      `Project ${source.title} duplicated as ${name}`,
      ...tasks.map((task) => `Task plan copied into ${name}: ${task.title}`),
    ],
    expectedRevisions: Object.fromEntries(
      [source, ...sourceTasks].map((record) => [record.id, record.revision]),
    ),
    eventTypes: records.map(() => "create" as const),
  };
}
