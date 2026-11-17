import { useState } from "react";
import { Code2 } from "lucide-react";
import { Button, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { CAPABILITY_LABELS } from "@/platform/capability";
import { useCollection, useEvents } from "@/platform/workspace";
import { actOverlay, peopleOptions, redact, type ActInput } from "@/applications/t6kit/act";
import { BoundaryNotice, downloadCsv } from "@/applications/t6kit/kit";
import { entryForRecord } from "@/applications/connect/catalog";
import {
  COMPONENT_LABELS, generatedFiles, issueTotals, makeComponent, readApp, validateApp,
  type AppModel, type ComponentKind, type ModelIssue,
} from "./model";
import { NoProject, useAppRecord } from "./builder";
import { saveApp, useBuildUi } from "./state";
import { wallMs } from "@/platform/clock";

/* ====================================================================== *
 * BUILD contract actions. Every write goes through saveApp (patch with
 * expectRevision); anything that would need a runtime, a repository host
 * or a provider records the attempt and says it stopped.
 * ====================================================================== */

const nowIso = (context: ScreenContext) => context.now.toISOString();

const routeProject = (records: Rec[], context: ScreenContext) => {
  return context.params.id ? records.filter((row) => row.id === context.params.id) : records;
};

const model = (record?: Rec): AppModel => readApp(record);

const SECRET_SHAPE = /(api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_\-./+]{12,}|\b(sk|pk|ghp|xox[bp])[-_][A-Za-z0-9]{10,}/i;

async function currentProject(context: ScreenContext): Promise<Rec | undefined> {
  const repo = await import("@/platform/repo");
  const projects = await repo.listByCollection(context.org.id, "appProjects");
  return context.params.id ? projects.find((item) => item.id === context.params.id) : undefined;
}

/** Run the model suites, write the counts onto the project and an event the Runs tab reads. */
export async function runChecks(context: ScreenContext): Promise<{ fail: number; warn: number; pass: number } | undefined> {
  const record = await currentProject(context);
  if (!record) { context.toast("No project", "Create a project first.", "blocked"); return undefined; }
  const totals = issueTotals(validateApp(readApp(record)));
  await context.mutate.patch(record.id, {
    fields: { ...record.fields, lastCheckAt: nowIso(context), checkFail: totals.fail, checkWarn: totals.warn, checkPass: totals.pass },
  }, { expectRevision: record.revision, event: `Checks run on ${record.title}: ${totals.fail} failing, ${totals.warn} to review, ${totals.pass} passing` });
  context.toast("Checks run", `${totals.fail} failing, ${totals.warn} to review, ${totals.pass} passing. These read the model; they do not prove the app works.`, totals.fail ? "blocked" : "ok");
  return totals;
}

export async function exportChecks(context: ScreenContext): Promise<void> {
  const record = await currentProject(context);
  if (!record) return;
  const issues = validateApp(readApp(record));
  downloadCsv(`${context.org.slug}-${record.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-checks.csv`, ["area", "level", "check", "detail"], issues.map((issue) => [issue.area, issue.level, issue.title, issue.detail]));
  await context.mutate.log(`Check results for ${record.title} exported: ${issues.length} checks.`, { entityId: record.id, type: "export" });
  context.toast("Exported", `${issues.length} check results written to CSV.`);
}

function FailingSummary({ record }: ActInput) {
  if (!record) return null;
  const totals = issueTotals(validateApp(model(record)));
  return <Properties rows={[{ label: "Failing checks now", value: <span className="ds-num">{String(totals.fail)}</span> }, { label: "To review", value: <span className="ds-num">{String(totals.warn)}</span> }]} />;
}

/* ------------------------------ Overview ------------------------------ */

export const askEngineer = actOverlay({
  id: "ask engineer",
  title: "Ask an engineer",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "Your question becomes a task assigned to the engineer you choose, with the failing checks attached. An AI engineer would need a model provider; that choice is recorded as waiting for one.",
  Details: FailingSummary,
  fields: ({ people }) => [
    { name: "engineer", label: "Engineer", kind: "select", options: [...peopleOptions(people), { value: "__ai", label: "An AI engineer (needs a model provider)" }] },
    { name: "question", label: "Question", kind: "textarea", required: true },
  ],
  submit: "Ask",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const failing = validateApp(model(record)).filter((issue) => issue.level === "fail");
    const ai = values.engineer === "__ai";
    await context.mutate.create({
      collection: "tasks",
      title: `Engineering question on ${record.title}`,
      status: ai ? "blocked" : "ready",
      summary: `${values.question}\n\nFailing checks: ${failing.map((issue) => issue.title).join("; ") || "none"}`,
      at: nowIso(context),
      ownerName: ai ? context.actor : values.engineer,
      fields: { stage: ai ? "blocked" : "ready", assignee: ai ? "AI engineer (not connected)" : values.engineer, project: record.title, askedBy: context.actor },
    }, `Engineering question on ${record.title} for ${ai ? "an AI engineer" : values.engineer}`);
    if (ai) {
      await context.mutate.log(`Question on ${record.title} for an AI engineer is waiting: no model provider is connected.`, { entityId: record.id, type: "capability", capability: "not_connected" });
      return { title: "Waiting for a model provider", body: "The question is a task, but no model will answer it until one is connected.", tone: "blocked" };
    }
    return `${values.engineer} has the question as a task, with ${failing.length} failing checks attached.`;
  },
});

/* ------------------------------ Builder ------------------------------ */

export const addComponent = actOverlay({
  id: "add component",
  title: "Add a component",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "The component is added to the chosen screen after the selected component, or at the end, and bound to the entity you pick. It is the same write the palette makes, and it is undoable from the model history.",
  fields: ({ record }) => {
    const app = model(record);
    const ui = useBuildUi.getState();
    return [
      { name: "kind", label: "Component", kind: "select", options: (Object.keys(COMPONENT_LABELS) as ComponentKind[]).map((kind) => ({ value: kind, label: COMPONENT_LABELS[kind] })) },
      { name: "screen", label: "Screen", kind: "select", initial: ui.screenId || app.screens[0]?.id, options: app.screens.map((screen) => ({ value: screen.id, label: screen.name })) },
      { name: "entity", label: "Reads", kind: "select", options: [{ value: "", label: "Unbound (text only)" }, ...app.entities.map((entity) => ({ value: entity.id, label: entity.name }))] },
      { name: "position", label: "Where", kind: "select", options: [{ value: "after", label: "After the selected component" }, { value: "end", label: "At the end" }, { value: "start", label: "At the start" }] },
    ];
  },
  blocked: ({ record }) => (record && model(record).screens.length === 0 ? "Add a screen to the project first." : undefined),
  submit: "Add it",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = model(record);
    const screen = app.screens.find((item) => item.id === values.screen) ?? app.screens[0];
    const component = { ...makeComponent(values.kind as ComponentKind), entityId: values.entity };
    const selected = screen.components.findIndex((item) => item.id === useBuildUi.getState().componentId);
    const index = values.position === "start" ? 0 : values.position === "after" && selected >= 0 ? selected + 1 : screen.components.length;
    const components = [...screen.components];
    components.splice(index, 0, component);
    await saveApp(context, record, { ...app, screens: app.screens.map((item) => (item.id === screen.id ? { ...item, components } : item)) }, `${component.title} added to ${screen.name}`);
    useBuildUi.getState().setScreen(screen.id);
    useBuildUi.getState().selectComponent(component.id);
    context.setTab("Design");
    return `${component.title} is on ${screen.name} at position ${index + 1}.`;
  },
});

export const editStyles = actOverlay({
  id: "edit styles",
  title: "Edit the component's style",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "Changes the selected component's width on the twelve-column grid and its heading. Narrower widths stack on a phone, as the responsive tab shows.",
  blocked: ({ record }) => {
    const ui = useBuildUi.getState();
    const found = model(record).screens.flatMap((screen) => screen.components).some((component) => component.id === ui.componentId);
    return found ? undefined : "Select a component on the builder canvas first.";
  },
  fields: ({ record }) => {
    const ui = useBuildUi.getState();
    const component = model(record).screens.flatMap((screen) => screen.components).find((item) => item.id === ui.componentId);
    return [
      { name: "title", label: "Heading", required: true, initial: component?.title },
      { name: "span", label: "Width", kind: "select", initial: String(component?.span ?? 6), options: [
        { value: "4", label: "A third (4 of 12)" }, { value: "6", label: "Half (6 of 12)" }, { value: "8", label: "Two thirds (8 of 12)" }, { value: "12", label: "Full width" },
      ] },
    ];
  },
  submit: "Apply the style",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = model(record);
    const id = useBuildUi.getState().componentId;
    const span = Number(values.span) as 4 | 6 | 8 | 12;
    await saveApp(context, record, {
      ...app,
      screens: app.screens.map((screen) => ({ ...screen, components: screen.components.map((component) => (component.id === id ? { ...component, title: values.title, span } : component)) })),
    }, `Style of ${values.title} changed to ${span} columns`);
    return `${values.title} now spans ${span} of 12 columns.`;
  },
});

/* ------------------------------ Code ------------------------------ */

export function EditFileForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model: app } = useAppRecord(context);
  const kept = app.files;
  const [path, setPath] = useState(kept[0]?.path ?? "");
  const [newPath, setNewPath] = useState("");
  const [content, setContent] = useState(kept[0]?.content ?? "");
  const [error, setError] = useState("");
  /* The project is read asynchronously; pick up the first kept file once it arrives. */
  if (!path && kept[0]) {
    setPath(kept[0].path);
    setContent(kept[0].content);
  } else if (!path && record) {
    setPath("__new");
  }
  if (!record) return <NoProject />;
  const generated = generatedFiles(app).map((file) => file.path);
  const target = path === "__new" ? newPath.trim() : path;
  return (
    <form
      id="edit-file"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!target) { setError("Name the file."); return; }
        if (generated.includes(target)) { setError(`${target} is generated from the model on every read. Edit the model to change it.`); return; }
        if (SECRET_SHAPE.test(content)) { setError("That content looks like a credential. A secret never goes into a project file; it belongs in a server-side store."); return; }
        const files = kept.some((file) => file.path === target) ? kept.map((file) => (file.path === target ? { ...file, content } : file)) : [...kept, { path: target, content }];
        await saveApp(context, record, { ...app, files }, `File ${target} edited (${content.split("\n").length} lines)`);
        context.toast("File saved", `${target} is kept with the project.`);
        close();
      }}
    >
      <Field label="File" htmlFor="edit-path">
        <Select id="edit-path" value={path} onChange={(event) => { setPath(event.target.value); setContent(kept.find((file) => file.path === event.target.value)?.content ?? ""); setError(""); }}>
          {kept.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}
          <option value="__new">A new file…</option>
        </Select>
      </Field>
      {path === "__new" && <Field label="Path" required htmlFor="edit-newpath"><TextInput id="edit-newpath" value={newPath} onChange={(event) => setNewPath(event.target.value)} placeholder="docs/notes.md" /></Field>}
      <Field label="Content" htmlFor="edit-content"><TextArea id="edit-content" rows={12} value={content} onChange={(event) => setContent(event.target.value)} className="ds-num" /></Field>
      <Notice tone="info" title="Generated files are read-only">The four files produced from the model ({generated.join(", ")}) cannot be edited here; they are regenerated on every read. Kept files are stored with the project.</Notice>
      {error && <Notice tone="danger" title="Not saved">{error}</Notice>}
    </form>
  );
}

export const commitChange = actOverlay({
  id: "commit",
  title: "Commit a version",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "A commit records the model as a named version with your message: entity and screen counts, who and when. There is no remote repository, so nothing is pushed.",
  Details: ({ record }) => {
    const app = model(record);
    const last = [...app.versions].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
    return (
      <Properties rows={[
        { label: "Last version", value: last ? `${last.label} · ${last.note}` : "None yet" },
        { label: "Entities", value: last ? `${last.entities} → ${app.entities.length}` : String(app.entities.length) },
        { label: "Screens", value: last ? `${last.screens} → ${app.screens.length}` : String(app.screens.length) },
      ]} />
    );
  },
  fields: () => [{ name: "message", label: "Commit message", required: true, placeholder: "Bind the quote board to Quote" }],
  submit: "Commit",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = model(record);
    const version = { id: `ve-${wallMs().toString(36)}`, label: `v${app.versions.length + 1}`, at: nowIso(context), note: values.message, actor: context.actor, entities: app.entities.length, screens: app.screens.length };
    await saveApp(context, record, { ...app, versions: [...app.versions, version] }, `Commit ${version.label} (${version.entities} entities, ${version.screens} screens): ${values.message}`);
    return `${version.label} recorded. Nothing was pushed: there is no remote.`;
  },
});

export const branchProject = actOverlay({
  id: "branch",
  title: "Branch the project",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: ({ record }) => `A branch is a separate draft project carrying ${record?.title ?? "this project"}'s model as it stands, linked back to it. Work there does not change the original until someone copies it across.`,
  fields: () => [{ name: "name", label: "Branch name", required: true, placeholder: "quote-board-redesign" }],
  submit: "Create the branch",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const name = values.name.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
    const created = await context.mutate.create({
      collection: "appProjects", title: `${record.title} · ${name}`, status: "draft", summary: `Branch ${name} of ${record.title}.`,
      fields: { ...record.fields, branchOf: record.id, branchName: name, delivery: "not_connected" }, body: { ...model(record), releases: [] },
    }, `Branch ${name} created from ${record.title}`);
    return `${created.title} is a draft branch with the same model.`;
  },
});

const SAFE_COMMANDS: { id: string; label: string; run: (app: AppModel) => string }[] = [
  { id: "check", label: "check — type-check the model and generated files", run: (app) => { const t = issueTotals(validateApp(app)); return `${t.fail} errors, ${t.warn} warnings, ${t.pass} checks passing`; } },
  { id: "files", label: "ls — list the project files", run: (app) => [...generatedFiles(app), ...app.files].map((file) => `${file.path} (${file.content.split("\n").length} lines)`).join("\n") },
  { id: "count", label: "wc — count lines of generated code", run: (app) => `${generatedFiles(app).reduce((sum, file) => sum + file.content.split("\n").length, 0)} lines across ${generatedFiles(app).length} generated files` },
];

export function SafeCommandPanel({ context }: { context: ScreenContext }) {
  const { record, model: app } = useAppRecord(context);
  const [command, setCommand] = useState(SAFE_COMMANDS[0].id);
  const [output, setOutput] = useState("");
  if (!record) return <NoProject />;
  return (
    <Stack gap={3}>
      <Notice tone="danger" title="Only allowlisted, read-only commands run">
        There is no shell, no filesystem and no network here. The three commands below read the model and nothing else; anything touching credentials, the network or files outside the project cannot be typed in, because there is no free-text prompt to type it into.
      </Notice>
      <Field label="Command" htmlFor="safe-command">
        <Select id="safe-command" value={command} onChange={(event) => setCommand(event.target.value)}>
          {SAFE_COMMANDS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </Select>
      </Field>
      <Button variant="primary" onClick={async () => {
        const found = SAFE_COMMANDS.find((item) => item.id === command) ?? SAFE_COMMANDS[0];
        const result = found.run(app);
        setOutput(result);
        await context.mutate.log(`Safe command ${found.id} run on ${record.title}: ${result.split("\n")[0]}`, { entityId: record.id, type: "command" });
      }}>Run it</Button>
      {output && <pre className="t6-code">{output}</pre>}
    </Stack>
  );
}

/* ------------------------------ Database ------------------------------ */

export const validatePolicy = actOverlay({
  id: "validate policy",
  title: "Validate the access policy",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "Runs the access checks over every role and records the result on the project: wide write grants, a default role that can write, and missing roles. A pass means the policy is consistent, not that a server enforces it.",
  Details: ({ record }) => {
    const issues = validateApp(model(record)).filter((issue) => issue.area === "Access");
    return <IssueList issues={issues} empty="No role is defined, so there is no policy to validate." />;
  },
  submit: "Record the validation",
  apply: async ({ record, context }) => {
    if (!record) return;
    const issues = validateApp(model(record)).filter((issue) => issue.area === "Access");
    const totals = issueTotals(issues);
    await context.mutate.patch(record.id, { fields: { ...record.fields, policyCheckedAt: nowIso(context), policyWarn: totals.warn, policyFail: totals.fail } }, { expectRevision: record.revision, event: `Access policy validated on ${record.title}: ${totals.fail} failing, ${totals.warn} to review, ${totals.pass} passing` });
    context.setTab("Policies");
    return { body: `${totals.fail} failing, ${totals.warn} to review, ${totals.pass} passing.`, tone: totals.fail || totals.warn ? "blocked" : "ok" };
  },
});

export function IssueList({ issues, empty }: { issues: ModelIssue[]; empty: string }) {
  if (issues.length === 0) return <Notice tone="neutral" title="Nothing to check">{empty}</Notice>;
  return (
    <div className="t6-checks">
      {issues.map((issue) => (
        <div key={issue.id} className="t6-check" data-state={issue.level}>
          <span className="t6-check-dot" aria-hidden="true" />
          <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
          <Pill tone={issue.level === "fail" ? "danger" : issue.level === "warn" ? "warning" : "success"}>{issue.level}</Pill>
        </div>
      ))}
    </div>
  );
}

export const seedEntity = actOverlay({
  id: "seed",
  title: "Seed an entity",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "Seed rows are typed by you and stored with the project for the preview and the checks, labelled as seed data. They are never written into a workspace collection and no row is generated for you.",
  fields: ({ record }) => {
    const app = model(record);
    const ui = useBuildUi.getState();
    return [
      { name: "entity", label: "Entity", kind: "select", initial: ui.entityId || app.entities[0]?.id, options: app.entities.map((entity) => ({ value: entity.id, label: `${entity.name} (${entity.fields.map((field) => field.name).join(", ")})` })) },
      { name: "rows", label: "Rows as CSV, header first", kind: "textarea", required: true, placeholder: "Title,Status\nBrass collar quote,Open" },
      { name: "replace", label: "Replace the existing seed rows", kind: "checkbox" },
    ];
  },
  blocked: ({ record }) => (record && model(record).entities.length === 0 ? "Create an entity first." : undefined),
  submit: "Seed the rows",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = model(record);
    const entity = app.entities.find((item) => item.id === values.entity);
    if (!entity) throw new Error("Choose an entity.");
    const lines = values.rows.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const header = (lines[0] ?? "").split(",").map((cell) => cell.trim());
    const rows = lines.slice(1).map((line) => line.split(",").map((cell) => cell.trim()));
    if (rows.length === 0) throw new Error("Add at least one row under the header.");
    const unknown = header.filter((name) => !entity.fields.some((field) => field.name.toLowerCase() === name.toLowerCase()));
    if (unknown.length) throw new Error(`${entity.name} has no field called ${unknown.join(", ")}.`);
    const required = entity.fields.filter((field) => field.required);
    const seeded = rows.map((row, index) => {
      const value: Record<string, string> = {};
      entity.fields.forEach((field) => { const column = header.findIndex((name) => name.toLowerCase() === field.name.toLowerCase()); value[field.id] = column >= 0 ? row[column] ?? "" : ""; });
      const missing = required.filter((field) => !value[field.id]);
      if (missing.length) throw new Error(`Row ${index + 1} leaves ${missing.map((field) => field.name).join(", ")} empty, which is required.`);
      return value;
    });
    const previous = values.replace ? [] : app.seeds?.[entity.id] ?? [];
    await saveApp(context, record, { ...app, seeds: { ...(app.seeds ?? {}), [entity.id]: [...previous, ...seeded] } }, `${seeded.length} seed rows added to ${entity.name}`);
    context.setTab("Data");
    return `${seeded.length} seed rows stored for ${entity.name}, labelled as seed data.`;
  },
});

/* ------------------------------ API ------------------------------ */

export const testEndpoint = actOverlay({
  id: "test endpoint",
  title: "Test an endpoint",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "Evaluates a request against the contract without a server: whether the role may call it, and whether the body satisfies the entity's required fields. The result is recorded and shown on the Runs tab. Nothing is sent anywhere.",
  fields: ({ record }) => {
    const app = model(record);
    return [
      { name: "endpoint", label: "Endpoint", kind: "select", options: app.endpoints.map((endpoint) => ({ value: endpoint.id, label: `${endpoint.method} ${endpoint.path}` })) },
      { name: "role", label: "Call as", kind: "select", options: [{ value: "", label: "No role (anonymous)" }, ...app.roles.map((role) => ({ value: role.id, label: role.name }))] },
      { name: "body", label: "Request body (JSON, for POST and PATCH)", kind: "textarea", placeholder: '{ "Title": "Brass collar quote" }' },
    ];
  },
  blocked: ({ record }) => (record && model(record).endpoints.length === 0 ? "Define an endpoint first." : undefined),
  submit: "Run the test",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = model(record);
    const endpoint = app.endpoints.find((item) => item.id === values.endpoint);
    if (!endpoint) throw new Error("Choose an endpoint.");
    const role = app.roles.find((item) => item.id === values.role);
    const entity = app.entities.find((item) => item.id === endpoint.entityId);
    const grant = role ? role.grants[endpoint.entityId] ?? "none" : "none";
    const needs = endpoint.method === "GET" ? "read" : "write";
    let outcome: string;
    if (endpoint.auth === "role" && (!role || grant === "none" || (needs === "write" && grant !== "write"))) {
      outcome = `403 refused: ${role ? `${role.name} has ${grant} access` : "no role"} and ${needs} is required`;
    } else if (!entity) {
      outcome = "500 contract error: the endpoint names an entity that does not exist";
    } else if (needs === "write" && endpoint.method !== "DELETE") {
      let body: Record<string, unknown> = {};
      try { body = values.body ? JSON.parse(values.body) as Record<string, unknown> : {}; } catch { throw new Error("The body is not valid JSON."); }
      const missing = entity.fields.filter((field) => field.required && (body[field.name] === undefined || body[field.name] === ""));
      outcome = missing.length ? `422 invalid: ${missing.map((field) => field.name).join(", ")} required` : "200 accepted by the contract (no server executed it)";
    } else {
      outcome = endpoint.auth === "none" ? "200 allowed: the endpoint is open to anyone" : "200 allowed by the role grant (no server executed it)";
    }
    await context.mutate.patch(record.id, { fields: { ...record.fields, lastEndpointTest: `${endpoint.method} ${endpoint.path}: ${outcome}`, lastEndpointTestAt: nowIso(context) } }, { expectRevision: record.revision, event: `Endpoint test ${endpoint.method} ${endpoint.path} as ${role?.name ?? "anonymous"}: ${outcome}` });
    context.setTab("Runs");
    return { body: `${endpoint.method} ${endpoint.path}: ${outcome}.`, tone: outcome.startsWith("200") ? "ok" : "blocked" };
  },
});

export const deployFunctions = actOverlay({
  id: "deploy functions",
  title: "Deploy the API",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequenceTitle: "This stops at the runtime boundary",
  consequence: () => "The deployment is recorded in the release history as blocked, because no runtime hosts this API. It is refused outright while an endpoint is open with no written reason, so authorisation cannot be removed quietly.",
  Details: ({ record }) => {
    const app = model(record);
    const open = app.endpoints.filter((endpoint) => endpoint.auth === "none");
    return <Properties rows={[
      { label: "Endpoints", value: <span className="ds-num">{String(app.endpoints.length)}</span> },
      { label: "Open endpoints", value: open.length ? open.map((endpoint) => `${endpoint.method} ${endpoint.path}${endpoint.note ? "" : " (no reason)"}`).join(", ") : "None" },
      { label: "Runtime", value: <Pill tone="warning" dot>{CAPABILITY_LABELS.not_connected}</Pill> },
    ]} />;
  },
  blocked: ({ record }) => {
    const app = model(record);
    if (record && app.endpoints.length === 0) return "Define an endpoint first.";
    const unexplained = app.endpoints.filter((endpoint) => endpoint.auth === "none" && !endpoint.note.trim());
    if (unexplained.length) return `${unexplained.map((endpoint) => `${endpoint.method} ${endpoint.path}`).join(", ")} has no role requirement and no written reason. Require a role or explain it first.`;
    if (record?.fields.deploysPaused) return `Deployments are paused: ${String(record.fields.pauseReason ?? "")}`;
    return undefined;
  },
  submit: "Record the deployment attempt",
  apply: async ({ record, context }) => {
    if (!record) return;
    const app = model(record);
    const release = { id: `re-${wallMs().toString(36)}`, environment: "production" as const, at: nowIso(context), state: "blocked" as const, note: `API with ${app.endpoints.length} endpoints stopped at the runtime boundary: nothing hosts it.`, actor: context.actor };
    await saveApp(context, record, { ...app, releases: [...app.releases, release] }, "API deployment recorded as blocked at the runtime boundary");
    await context.mutate.log(`API deployment for ${record.title} stopped: no runtime is connected.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: "Not deployed", body: "The attempt is in the release history as blocked.", tone: "blocked" };
  },
});

export function TraceInspector({ context }: { context: ScreenContext }) {
  const { record, model: app } = useAppRecord(context);
  const [id, setId] = useState("");
  if (!record) return <NoProject />;
  const endpoint = app.endpoints.find((item) => item.id === id) ?? app.endpoints[0];
  if (!endpoint) return <Empty title="No endpoint to trace" icon={<Code2 size={20} />}>Define an endpoint first.</Empty>;
  const entity = app.entities.find((item) => item.id === endpoint.entityId);
  const roles = app.roles.filter((role) => (role.grants[endpoint.entityId] ?? "none") !== "none");
  const steps = [
    { label: `Route ${endpoint.method} ${endpoint.path}`, ok: true, detail: "Matched by the generated router" },
    { label: "Authorisation", ok: endpoint.auth === "role", detail: endpoint.auth === "role" ? `Role required; ${roles.map((role) => role.name).join(", ") || "no role"} may call it` : "Open: no role check runs" },
    { label: `Validate against ${entity?.name ?? "a missing entity"}`, ok: Boolean(entity), detail: entity ? `${entity.fields.filter((field) => field.required).length} required fields` : "The entity no longer exists" },
    { label: "Read or write the collection", ok: Boolean(entity?.collection), detail: entity?.collection ? `Workspace collection ${entity.collection}` : "Unbound: no collection would be touched" },
  ];
  return (
    <Stack gap={3}>
      <Field label="Endpoint" htmlFor="trace-endpoint">
        <Select id="trace-endpoint" value={endpoint.id} onChange={(event) => setId(event.target.value)}>
          {app.endpoints.map((item) => <option key={item.id} value={item.id}>{item.method} {item.path}</option>)}
        </Select>
      </Field>
      <div className="t6-checks">
        {steps.map((step) => (
          <div key={step.label} className="t6-check" data-state={step.ok ? "pass" : "warn"}>
            <span className="t6-check-dot" aria-hidden="true" />
            <div><strong>{step.label}</strong><p className="ds-subtle">{step.detail}</p></div>
            <Pill tone={step.ok ? "success" : "warning"}>{step.ok ? "on the path" : "check"}</Pill>
          </div>
        ))}
      </div>
      <Properties rows={[{ label: "Last recorded test", value: String(record.fields.lastEndpointTest ?? "None") }]} />
      <Notice tone="warning" title="A static trace, not a runtime one">No request has ever been served, so this is the path the contract defines. Runtime timings would need a server.</Notice>
    </Stack>
  );
}

/* ------------------------------ Auth ------------------------------ */

export const configureProvider = actOverlay({
  id: "configure provider",
  title: "Configure a sign-in provider",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "The chosen method and its settings are recorded on the project as configuration required. It cannot complete without a server, an identity provider or a registered origin, so nobody can sign in with it yet.",
  fields: ({ record }) => [
    { name: "method", label: "Method", kind: "select", initial: String(record?.fields.authProvider ?? ""), options: ["Email and password", "Single sign-on", "Passkey"].map((value) => ({ value, label: value })) },
    { name: "domain", label: "Domain or issuer it would trust", placeholder: "northline.co.uk" },
    { name: "note", label: "Notes", kind: "textarea" },
  ],
  submit: "Record the configuration",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, authProvider: values.method, authDomain: values.domain, authNote: values.note, authProviderState: "configuration_required" } }, { expectRevision: record.revision, event: `Sign-in provider ${values.method} configured on ${record.title}: configuration required` });
    await context.mutate.log(`${values.method} recorded for ${record.title}; it needs a server to complete.`, { entityId: record.id, type: "capability", capability: "configuration_required" });
    context.setTab("Providers");
    return { body: `${values.method} is recorded as configuration required.`, tone: "blocked" };
  },
});

export const revokeSessions = actOverlay({
  id: "revoke session",
  title: "Revoke sessions",
  tone: "danger",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "No session has ever been issued, so there is nothing to end now. The revocation is recorded as a cut-off on the project: a runtime would refuse every session for the chosen role issued before this moment. The preview's role simulation is cleared too.",
  fields: ({ record }) => [
    { name: "role", label: "Sessions for", kind: "select", options: [{ value: "all", label: "Every role" }, ...model(record).roles.map((role) => ({ value: role.name, label: role.name }))] },
    { name: "reason", label: "Reason", kind: "textarea", required: true },
  ],
  submit: "Record the revocation",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, sessionsRevokedBefore: nowIso(context), sessionsRevokedFor: values.role, sessionRevokeReason: values.reason } }, { expectRevision: record.revision, event: `Sessions for ${values.role} revoked on ${record.title}: ${values.reason}` });
    useBuildUi.getState().setPreviewRole("");
    return `Cut-off recorded for ${values.role}. No live session existed.`;
  },
});

/* ------------------------------ Tests ------------------------------ */

interface ProposedFix { id: string; label: string; apply: (app: AppModel) => AppModel }

export function deterministicFixes(app: AppModel): ProposedFix[] {
  const fixes: ProposedFix[] = [];
  for (const screen of app.screens) {
    for (const component of screen.components) {
      const entity = app.entities.find((item) => item.id === component.entityId);
      if (!entity) continue;
      const missing = component.fieldIds.filter((id) => !entity.fields.some((field) => field.id === id));
      if (missing.length) {
        fixes.push({
          id: `prune-${component.id}`,
          label: `Remove ${missing.length} deleted fields from ${component.title} on ${screen.name}`,
          apply: (model) => ({ ...model, screens: model.screens.map((item) => ({ ...item, components: item.components.map((entry) => (entry.id === component.id ? { ...entry, fieldIds: entry.fieldIds.filter((id) => !missing.includes(id)) } : entry)) })) }),
        });
      }
    }
  }
  const newRole = app.roles.find((role) => /new|member|default/i.test(role.name));
  if (newRole && Object.values(newRole.grants).some((grant) => grant === "write")) {
    fixes.push({
      id: `readonly-${newRole.id}`,
      label: `Make ${newRole.name} read-only, so a new person inherits no write access`,
      apply: (model) => ({ ...model, roles: model.roles.map((role) => (role.id === newRole.id ? { ...role, grants: Object.fromEntries(Object.entries(role.grants).map(([key, grant]) => [key, grant === "write" ? "read" : grant])) } : role)) }),
    });
  }
  for (const entity of app.entities) {
    for (const field of entity.fields) {
      if (field.unique && !field.required) {
        fixes.push({
          id: `require-${field.id}`,
          label: `Make ${entity.name}.${field.name} required, since it is unique`,
          apply: (model) => ({ ...model, entities: model.entities.map((item) => (item.id === entity.id ? { ...item, fields: item.fields.map((entry) => (entry.id === field.id ? { ...entry, required: true } : entry)) } : item)) }),
        });
      }
    }
  }
  return fixes;
}

export const approveFix = actOverlay({
  id: "AI patch review",
  title: "Approve a fix",
  kind: "drawer",
  width: 600,
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "Only fixes the checker can compute exactly are offered: each is one model change you can read before approving, and it is reversible from the model history. Fixes written by an AI need a model provider, and none is connected.",
  Details: () => <BoundaryNotice id="model.inference" action="An AI-proposed fix" />,
  blocked: ({ record }) => (record && deterministicFixes(model(record)).length === 0 ? "No failing or reviewable check has a fix the checker can compute. Read the issues and change the model by hand." : undefined),
  fields: ({ record }) => [{ name: "fix", label: "Proposed change", kind: "select", options: deterministicFixes(model(record)).map((fix) => ({ value: fix.id, label: fix.label })) }],
  submit: "Approve and apply",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const app = model(record);
    const fix = deterministicFixes(app).find((item) => item.id === values.fix);
    if (!fix) throw new Error("That fix no longer applies.");
    const next = fix.apply(app);
    const before = issueTotals(validateApp(app));
    const after = issueTotals(validateApp(next));
    await saveApp(context, record, next, `Fix approved by ${context.actor}: ${fix.label}`);
    return `${fix.label}. Failing ${before.fail} → ${after.fail}, to review ${before.warn} → ${after.warn}.`;
  },
});

/* ------------------------------ Deployments ------------------------------ */

export const pauseDeployments = actOverlay({
  id: "pause deployments",
  title: "Pause or resume deployments",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: ({ record }) => (record?.fields.deploysPaused
    ? `Deployments for ${record.title} are paused (${String(record.fields.pauseReason ?? "")}). Resuming lets promotion be attempted again.`
    : `While paused, promotion of ${record?.title ?? "the project"} is refused for every environment. The release history is kept.`),
  fields: () => [{ name: "reason", label: "Reason", kind: "textarea", required: true }],
  submit: "Apply",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const paused = !record.fields.deploysPaused;
    await context.mutate.patch(record.id, { fields: { ...record.fields, deploysPaused: paused, pauseReason: values.reason, pausedBy: paused ? context.actor : "" } }, { expectRevision: record.revision, event: `Deployments ${paused ? "paused" : "resumed"} on ${record.title} by ${context.actor}: ${values.reason}` });
    return `Deployments are ${paused ? "paused" : "resumed"}.`;
  },
});

export function ConfigInspector({ context }: { context: ScreenContext }) {
  const { record, model: app } = useAppRecord(context);
  if (!record) return <NoProject />;
  const config = {
    name: app.settings.name,
    environment: app.settings.environment,
    locale: app.settings.locale,
    entities: app.entities.map((entity) => ({ name: entity.name, collection: entity.collection || null })),
    endpoints: app.endpoints.map((endpoint) => `${endpoint.method} ${endpoint.path} (${endpoint.auth})`),
    roles: app.roles.map((role) => role.name),
    integrations: String(record.fields.integrations ?? "").split(",").filter(Boolean),
    authProvider: record.fields.authProvider ?? null,
    deploysPaused: Boolean(record.fields.deploysPaused),
    secrets: "none stored; referenced by name only",
  };
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Environment label", value: <Pill tone={app.settings.environment === "production" ? "danger" : app.settings.environment === "staging" ? "warning" : "neutral"} dot>{app.settings.environment}</Pill> },
        { label: "Runtime", value: <Pill tone="warning" dot>{CAPABILITY_LABELS.not_connected}</Pill> },
        { label: "Deployments", value: record.fields.deploysPaused ? <Pill tone="warning">paused</Pill> : "Not paused" },
      ]} />
      <pre className="t6-code">{JSON.stringify(config, null, 2)}</pre>
    </Stack>
  );
}

/* ------------------------------ Integrations ------------------------------ */

const attached = (record?: Rec) => String(record?.fields.integrations ?? "").split(",").filter(Boolean);

export const attachIntegration = actOverlay({
  id: "attach integration",
  title: "Attach an integration",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  useWatch: () => useCollection("connectors"),
  consequence: () => "The connector is attached to this project, so its generated code and checks know it is needed. Its state stays whatever the capability register says, which is not connected; attaching does not authorise anything.",
  fields: ({ record, watched }) => [{ name: "connector", label: "Connector", kind: "select", options: ((watched as Rec[] | undefined) ?? []).filter((row) => !attached(record).includes(row.id)).map((row) => ({ value: row.id, label: `${row.title} · ${row.status.replace(/_/g, " ")}` })) }],
  submit: "Attach",
  apply: async ({ record, values, context, watched }) => {
    if (!record) return;
    const connector = ((watched as Rec[] | undefined) ?? []).find((row) => row.id === values.connector);
    if (!connector) throw new Error("Choose a connector.");
    await context.mutate.patch(record.id, { fields: { ...record.fields, integrations: [...attached(record), connector.id].join(",") } }, { expectRevision: record.revision, event: `${connector.title} attached to ${record.title}; state ${connector.status}` });
    context.setTab("Connections");
    return `${connector.title} is attached. It is still not connected.`;
  },
});

function AttachedList({ record, watched }: ActInput) {
  const connectors = (watched as Rec[] | undefined) ?? [];
  const rows = connectors.filter((row) => attached(record).includes(row.id));
  if (rows.length === 0) return <Notice tone="neutral" title="Nothing attached">Attach an integration first.</Notice>;
  return <Properties rows={rows.map((row) => ({ label: row.title, value: <Pill tone="warning" dot>{CAPABILITY_LABELS[entryForRecord(row.fields)?.capability.state ?? "not_connected"]}</Pill> }))} />;
}

export const testIntegrations = actOverlay({
  id: "test integrations",
  title: "Test the attached integrations",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  useWatch: () => useCollection("connectors"),
  consequence: () => "Checks each attached integration from this browser: that the connector record exists and what the register says. A provider call is not attempted, and the result says so.",
  Details: AttachedList,
  blocked: ({ record }) => (record && attached(record).length === 0 ? "Attach an integration first." : undefined),
  submit: "Run and record",
  apply: async ({ record, context, watched }) => {
    if (!record) return;
    const rows = ((watched as Rec[] | undefined) ?? []).filter((row) => attached(record).includes(row.id));
    const result = `${rows.length} attached; ${rows.length} records found; 0 verified with a provider call`;
    await context.mutate.patch(record.id, { fields: { ...record.fields, integrationTestAt: nowIso(context), integrationTestResult: result } }, { expectRevision: record.revision, event: `Integration test on ${record.title}: ${result}` });
    await context.mutate.log(`Integration test for ${record.title}: no provider was contacted.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    context.setTab("Health");
    return { body: result, tone: "blocked" };
  },
});

export const rotateSecret = actOverlay({
  id: "rotate secret",
  title: "Rotate a secret",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  useWatch: () => useCollection("connectors"),
  consequenceTitle: "No secret is shown, stored or generated",
  consequence: () => "A rotation request is recorded for the integration you choose, with you as the requester. The new value would be issued by the provider and held on a server; this browser never sees it.",
  fields: ({ record, watched }) => [{ name: "connector", label: "Integration", kind: "select", options: ((watched as Rec[] | undefined) ?? []).filter((row) => attached(record).includes(row.id)).map((row) => ({ value: row.id, label: row.title })) }],
  blocked: ({ record }) => (record && attached(record).length === 0 ? "Attach an integration first; a secret belongs to one." : undefined),
  boundary: { id: "email.send", action: "Rotating a secret" },
  submit: "Record the rotation request",
  apply: async ({ record, values, context, watched }) => {
    if (!record) return;
    const connector = ((watched as Rec[] | undefined) ?? []).find((row) => row.id === values.connector);
    await context.mutate.patch(record.id, { fields: { ...record.fields, rotationRequestedAt: nowIso(context), rotationRequestedFor: connector?.title ?? values.connector } }, { expectRevision: record.revision, event: `Secret rotation requested for ${connector?.title ?? values.connector} on ${record.title}` });
    await context.mutate.log(`Secret rotation for ${connector?.title ?? "an integration"} requested: no credential exists here, nothing was issued.`, { entityId: record.id, type: "capability", capability: "not_connected" });
    return { title: "Requested, not rotated", body: "No secret is held here. The request is recorded.", tone: "blocked" };
  },
});

export const revokeIntegration = actOverlay({
  id: "revoke integration",
  title: "Revoke an integration",
  tone: "danger",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  useWatch: () => useCollection("connectors"),
  consequence: () => "The integration is detached from this project and the revocation is recorded. Generated code stops referencing it. No provider grant existed, so nothing is invalidated outside this workspace.",
  fields: ({ record, watched }) => [
    { name: "connector", label: "Integration", kind: "select", options: ((watched as Rec[] | undefined) ?? []).filter((row) => attached(record).includes(row.id)).map((row) => ({ value: row.id, label: row.title })) },
    { name: "reason", label: "Reason", kind: "textarea", required: true },
  ],
  blocked: ({ record }) => (record && attached(record).length === 0 ? "Nothing is attached to revoke." : undefined),
  submit: "Revoke",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, integrations: attached(record).filter((id) => id !== values.connector).join(",") } }, { expectRevision: record.revision, event: `Integration ${values.connector} revoked on ${record.title}: ${values.reason}` });
    return "Detached and recorded.";
  },
});

/* ------------------------------ Monitoring ------------------------------ */

export function EventInspector({ context }: { context: ScreenContext }) {
  const { record } = useAppRecord(context);
  const events = useEvents(record?.id);
  const [id, setId] = useState("");
  if (!record) return <NoProject />;
  const event = events.find((item) => item.id === id) ?? events[0];
  if (!event) return <Empty title="No event recorded for this project" icon={<Code2 size={20} />}>Every change, check and attempt on the project writes one.</Empty>;
  return (
    <Stack gap={3}>
      <Field label="Event" htmlFor="event-pick">
        <Select id="event-pick" value={event.id} onChange={(change) => setId(change.target.value)}>
          {events.map((item) => <option key={item.id} value={item.id}>{context.dateTime(item.at)} · {item.message.slice(0, 60)}</option>)}
        </Select>
      </Field>
      <Properties rows={[
        { label: "When", value: <span className="ds-num">{context.dateTime(event.at)}</span> },
        { label: "Actor", value: event.actor },
        { label: "Kind", value: <Pill tone="neutral">{event.type}</Pill> },
        { label: "Provider state", value: event.capability ? CAPABILITY_LABELS[event.capability] : "Not a provider event" },
      ]} />
      <p className="ds-prose">{redact(event.message)}</p>
      <Notice tone="info" title="Personal detail is masked">Email addresses, phone numbers and credential-shaped strings are redacted in this summary.</Notice>
    </Stack>
  );
}

export const createIncident = actOverlay({
  id: "create incident",
  title: "Create an incident",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "An incident is opened on the IT register against this project, with the failing checks named. There is no runtime, so it is a design fault, and it is labelled as ours.",
  Details: FailingSummary,
  fields: ({ record }) => [
    { name: "title", label: "What is wrong", required: true, initial: record ? `${record.title}: failing model checks` : "" },
    { name: "severity", label: "Severity", kind: "select", initial: "medium", options: ["low", "medium", "high"].map((level) => ({ value: level, label: level })) },
  ],
  submit: "Open the incident",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    const failing = validateApp(model(record)).filter((issue) => issue.level === "fail");
    const created = await context.mutate.create({
      collection: "incidents", title: values.title, status: "open",
      summary: failing.length ? `Failing: ${failing.map((issue) => issue.title).join("; ")}` : "Raised by hand; no check is failing.",
      at: nowIso(context),
      fields: { kind: "incident", severity: values.severity, service: "App builder", origin: "ours", owner: context.actor, projectId: record.id, impact: `${failing.length} failing checks on ${record.title}` },
    }, `Incident opened from ${record.title}`);
    return `${created.title} is on the IT incident register.`;
  },
});

export const tuneMonitor = actOverlay({
  id: "alert rule",
  title: "Tune the monitor",
  collection: "appProjects",
  noun: "project",
  candidates: routeProject,
  consequence: () => "The rule is saved on the project and evaluated whenever its checks run here. An alert would need a mail provider, so a raised alert is written to the project's events and the attention list instead.",
  boundary: { id: "email.send", action: "Sending an alert" },
  fields: ({ record }) => [
    { name: "threshold", label: "Raise when failing checks reach", kind: "number", required: true, initial: String(record?.fields.alertFailThreshold ?? 1) },
    { name: "onNew", label: "Raise when a passing check starts failing", kind: "checkbox", checked: record?.fields.alertOnNewFail !== false },
  ],
  submit: "Save the rule",
  apply: async ({ record, values, context }) => {
    if (!record) return;
    await context.mutate.patch(record.id, { fields: { ...record.fields, alertFailThreshold: Number(values.threshold), alertOnNewFail: Boolean(values.onNew) } }, { expectRevision: record.revision, event: `Monitor on ${record.title} tuned: raise at ${values.threshold} failing checks` });
    return `Saved. It raises at ${values.threshold} failing checks.`;
  },
});

export async function exportMonitoring(context: ScreenContext): Promise<void> {
  const record = await currentProject(context);
  if (!record) return;
  const repo = await import("@/platform/repo");
  const events = (await repo.listEvents(context.org.id, 400)).filter((event) => event.entityId === record.id);
  downloadCsv(`${context.org.slug}-monitoring.csv`, ["at", "actor", "type", "event"], events.map((event) => [event.at, event.actor, event.type, redact(event.message)]));
  await context.mutate.log(`Monitoring export for ${record.title}: ${events.length} events.`, { entityId: record.id, type: "export" });
  context.toast("Exported", `${events.length} project events written to CSV, personal detail masked.`);
}

export function SeedRows({ entityId, app }: { entityId: string; app: AppModel }) {
  const rows = app.seeds?.[entityId] ?? [];
  const entity = app.entities.find((item) => item.id === entityId);
  if (!entity || rows.length === 0) return null;
  return (
    <Stack gap={2}>
      <Row gap={2}><strong className="ds-grow">Seed rows for {entity.name}</strong><Pill tone="warning">seed data, typed by a person</Pill></Row>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">Seed rows</caption>
          <thead><tr>{entity.fields.map((field) => <th key={field.id} scope="col">{field.name}</th>)}</tr></thead>
          <tbody>{rows.map((row, index) => <tr key={index}>{entity.fields.map((field) => <td key={field.id}>{row[field.id] || "—"}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </Stack>
  );
}

/* ------------------------------ Library ------------------------------ */

const REPO_ADDRESS = /^(https:\/\/|git@)[a-z0-9.-]+\.[a-z]{2,}[:/][\w.-]+\/[\w.-]+?(\.git)?$/i;

export const importRepository = actOverlay({
  id: "Git import",
  title: "Import a repository",
  consequenceTitle: "Nothing is fetched or run",
  consequence: () => "The repository address is recorded as a draft project waiting for its import. Fetching needs a network call this workspace does not make; when it can happen, the manifest is read without running it and every file stays read-only until a person approves it.",
  fields: () => [
    { name: "address", label: "Repository address", required: true, placeholder: "https://github.com/example/app.git" },
    { name: "title", label: "Project name", required: true, placeholder: "Trade desk import" },
  ],
  submit: "Record the import request",
  apply: async ({ values, context }) => {
    if (!REPO_ADDRESS.test(values.address)) throw new Error("That is not a repository address. Use https://host/owner/name.git or git@host:owner/name.git.");
    if (/[?&](token|key|password)=|\/\/[^/@]+:[^/@]+@/i.test(values.address)) throw new Error("The address carries a credential. Remove it: a token never goes into a project record.");
    const created = await context.mutate.create({
      collection: "appProjects", title: values.title, status: "draft",
      summary: `Import requested from ${values.address}. Nothing has been fetched, scanned or run.`,
      fields: { importSource: values.address, importState: "not_connected", delivery: "not_connected" },
      body: { entities: [], screens: [], automations: [], roles: [], versions: [], endpoints: [], releases: [], files: [] },
    }, `Repository import requested: ${values.address}`);
    await context.mutate.log(`Repository import for ${values.title} stopped before fetching: no network access from this workspace.`, { entityId: created.id, type: "capability", capability: "not_connected" });
    return { title: "Recorded, not imported", body: `${created.title} is a draft waiting for its import. No code was fetched.`, tone: "blocked" };
  },
});
