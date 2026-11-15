import { useState } from "react";
import {
  Boxes, Code2, Database, Gauge, KeyRound, LayoutTemplate, Rocket, ShieldCheck, TestTube2, Workflow,
} from "lucide-react";
import {
  Button, Card, Checkbox, Empty, Field, Notice, Pill, Properties, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { BoundaryNotice, closeFooter, submitFooter } from "@/applications/t6kit/kit";
import {
  FIELD_KIND_LABELS, generateTypes, generatedFiles, issueTotals, makeField, validateApp,
} from "./model";
import { AppBuilder, ComponentInspector, NoProject, useAppRecord } from "./builder";
import {
  ApiScreen, AppOverview, AuthScreen, CodeScreen, DatabaseScreen, DeployScreen, ExpressionEditor,
  GitImportPanel, IntegrationsScreen, MigrationPanel, MonitorScreen, ProjectLibrary,
  ProjectSetupForm, ReleaseApproval, TestsScreen,
} from "./panels";
import { saveApp, useBuildUi } from "./state";

/* ====================================================================== *
 * BUILD — App Builder & Development
 * A project is an entity model, screens bound to it and the readable
 * TypeScript that falls out of both. The preview runs a designed screen
 * against records that genuinely exist in this workspace.
 * ====================================================================== */

function ComponentInspectorOverlay({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const ui = useBuildUi();
  if (!record) return <NoProject />;
  const screen = model.screens.find((item) => item.id === ui.screenId) ?? model.screens[0];
  const component = screen?.components.find((item) => item.id === ui.componentId);
  if (!component) return <Empty title="No component selected" icon={<LayoutTemplate size={20} />}>Select one on the builder canvas, then open this inspector.</Empty>;
  return (
    <ComponentInspector
      component={component}
      model={model}
      onEdit={(patch) => void saveApp(context, record, {
        ...model,
        screens: model.screens.map((item) => (item.id === screen!.id ? { ...item, components: item.components.map((entry) => (entry.id === component.id ? { ...entry, ...patch } : entry)) } : item)),
      }, `Edited ${component.title}`)}
    />
  );
}

function BindingTest({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const issues = validateApp(model).filter((issue) => issue.area === "Screens");
  const totals = issueTotals(issues);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Components checked", value: <span className="ds-num">{String(issues.length)}</span> },
        { label: "Resolving", value: <Pill tone="success">{totals.pass}</Pill> },
        { label: "Broken", value: <Pill tone={totals.fail ? "danger" : "neutral"}>{totals.fail}</Pill> },
        { label: "Method", value: "Each component's entity id and field ids are matched against the entities defined now." },
      ]} />
      {issues.length === 0 ? (
        <Notice tone="neutral" title="Nothing to bind yet">Add a data component to a screen and this test has something to check.</Notice>
      ) : (
        <Stack gap={2}>
          {issues.map((issue) => (
            <div key={issue.id} className="t6-check" data-state={issue.level}>
              <span className="t6-check-dot" aria-hidden="true" />
              <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
              <Pill tone={issue.level === "fail" ? "danger" : issue.level === "warn" ? "warning" : "success"}>{issue.level}</Pill>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function ColumnEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  const ui = useBuildUi();
  const payload = context.overlayPayload as { entityId?: string } | undefined;
  const entity = model.entities.find((item) => item.id === (payload?.entityId ?? ui.entityId)) ?? model.entities[0];
  const [fieldId, setFieldId] = useState(entity?.fields[0]?.id ?? "");
  if (!record) return <NoProject />;
  if (!entity) return <Empty title="No entity" icon={<Database size={20} />} />;
  const field = entity.fields.find((item) => item.id === fieldId) ?? entity.fields[0];
  if (!field) return <Empty title={`${entity.name} has no fields`} icon={<Database size={20} />} />;

  return (
    <form
      id="column-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next = {
          ...field,
          name: String(data.get("name") ?? field.name),
          kind: String(data.get("kind") ?? field.kind) as typeof field.kind,
          required: data.get("required") === "on",
          unique: data.get("unique") === "on",
          options: String(data.get("options") ?? "").split(",").map((item) => item.trim()).filter(Boolean),
          references: String(data.get("references") ?? ""),
        };
        await saveApp(context, record, {
          ...model,
          entities: model.entities.map((item) => (item.id === entity.id ? { ...item, fields: item.fields.map((entry) => (entry.id === field.id ? next : entry)) } : item)),
        }, `Field ${next.name} on ${entity.name} changed`);
        context.toast("Field saved", `${next.name} is ${next.required ? "required" : "optional"} on ${entity.name}.`);
        close();
      }}
    >
      <Field label="Field">
        <Select value={field.id} onChange={(event) => setFieldId(event.target.value)}>
          {entity.fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </Select>
      </Field>
      <Field label="Name" required><TextInput name="name" defaultValue={field.name} required /></Field>
      <Field label="Kind">
        <Select name="kind" defaultValue={field.kind}>
          {Object.entries(FIELD_KIND_LABELS).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </Select>
      </Field>
      <Field label="Options" hint="Comma separated. Only used by a choice field."><TextInput name="options" defaultValue={field.options.join(", ")} /></Field>
      <Field label="References" hint="Only used by a reference field.">
        <Select name="references" defaultValue={field.references}>
          <option value="">None</option>
          {model.entities.filter((item) => item.id !== entity.id).map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
        </Select>
      </Field>
      <Row gap={3}>
        <Checkbox name="required" label="Required" defaultChecked={field.required} />
        <Checkbox name="unique" label="Unique" defaultChecked={field.unique} />
      </Row>
      <Notice tone="info" title="The generated interface follows immediately">
        Marking a field optional changes its property to <code>?</code> in the generated TypeScript, which the code view shows on the next read.
      </Notice>
    </form>
  );
}

function MigrationDiff({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const previousBody = record.history[0]?.body;
  const before = previousBody ? generateTypes({ ...model, entities: entitiesFrom(previousBody) }) : "";
  const after = generateTypes(model);
  const lines = diff(before, after);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Compared against", value: record.history.length ? <span className="ds-num">{`Revision ${record.revision - 1}`}</span> : "No earlier revision" },
        { label: "Lines changed", value: <span className="ds-num">{String(lines.filter((line) => line.kind !== "same").length)}</span> },
      ]} />
      {record.history.length === 0 ? (
        <Notice tone="info" title="Nothing to compare yet">Change the model once and the next diff is against a revision that really existed.</Notice>
      ) : (
        <pre className="t6-code">
          {lines.map((line, index) => (
            <div key={index} style={{ color: line.kind === "add" ? "var(--success)" : line.kind === "remove" ? "var(--danger)" : undefined }}>
              {line.kind === "add" ? "+ " : line.kind === "remove" ? "- " : "  "}{line.text}
            </div>
          ))}
        </pre>
      )}
      <Notice tone="warning" title="A removed property is a removed column">
        Every red line below is a field that code and records relied on. Export a backup from the migrations tab before applying a change that removes one.
      </Notice>
    </Stack>
  );
}

function entitiesFrom(body: unknown) {
  const row = body && typeof body === "object" ? (body as { entities?: unknown }) : {};
  if (!Array.isArray(row.entities)) return [];
  return row.entities.map((item, index) => {
    const entity = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      id: typeof entity.id === "string" ? entity.id : `en${index + 1}`,
      name: typeof entity.name === "string" ? entity.name : `Entity ${index + 1}`,
      collection: typeof entity.collection === "string" ? entity.collection : "",
      fields: Array.isArray(entity.fields)
        ? entity.fields.map((raw, fieldIndex) => {
          const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
          const base = makeField("text");
          return {
            ...base,
            id: typeof source.id === "string" ? source.id : `fl${fieldIndex + 1}`,
            name: typeof source.name === "string" ? source.name : `Field ${fieldIndex + 1}`,
            kind: (typeof source.kind === "string" ? source.kind : "text") as typeof base.kind,
            required: source.required === true,
            unique: source.unique === true,
            options: Array.isArray(source.options) ? source.options.filter((option): option is string => typeof option === "string") : [],
            references: typeof source.references === "string" ? source.references : "",
          };
        })
        : [],
    };
  });
}

function diff(before: string, after: string): { kind: "same" | "add" | "remove"; text: string }[] {
  const left = before.split("\n");
  const right = after.split("\n");
  const out: { kind: "same" | "add" | "remove"; text: string }[] = [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === right[index]) {
      if (left[index] !== undefined) out.push({ kind: "same", text: left[index] });
      continue;
    }
    if (left[index] !== undefined) out.push({ kind: "remove", text: left[index] });
    if (right[index] !== undefined) out.push({ kind: "add", text: right[index] });
  }
  return out;
}

function CommandAuthorization({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="danger" title="No command runs from this browser">
        There is no shell, no filesystem and no sandbox here. A command typed into a prompt cannot be executed, which is the only safe answer while the only thing asking might be text someone pasted.
      </Notice>
      <Card eyebrow="POLICY" prov="human" title="What an allowlist would look like" subtitle="Recorded so the rule is visible before it is needed">
        <Properties rows={[
          { label: "Allowed", value: "Formatting and type checking the generated files" },
          { label: "Confirmed each time", value: "Installing a dependency" },
          { label: "Never from a prompt", value: "Anything touching credentials, the network or the filesystem outside the project" },
        ]} />
      </Card>
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.setTab("Problems"); }}>Look at the model problems instead</Button>
    </Stack>
  );
}

function DiffReview({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const files = generatedFiles(model);
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Generated, not stored">
        These four files are produced from the model each time they are read, so there is never a stale copy to review against. What changes them is a change to the model.
      </Notice>
      {files.map((file) => (
        <Card key={file.path} eyebrow="GENERATED" prov="human" title={file.path} subtitle={`${file.content.split("\n").length} lines`}>
          <pre className="t6-code" style={{ maxHeight: 180 }}>{file.content}</pre>
        </Card>
      ))}
    </Stack>
  );
}

function AuthIssuePanel({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { provider?: string } | undefined;
  const provider = payload?.provider ?? "Email and password";
  const needs: Record<string, string[]> = {
    "Email and password": ["A server that can store a password hash", "A way to send a reset message", "Rate limiting on the sign-in route"],
    "Single sign-on": ["An identity provider that trusts this application", "A verified domain", "A signing certificate the provider issues"],
    Passkey: ["A relying party registered against a real origin", "Server-side challenge storage", "A recovery route for a lost device"],
  };
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Method", value: provider },
        { label: "State", value: <Pill tone="warning" dot>Not connected</Pill> },
      ]} />
      <h4>What it would need</h4>
      <ul className="ds-prose">{(needs[provider] ?? []).map((item) => <li key={item}>{item}</li>)}</ul>
      <Notice tone="warning" title="None of those exist in a browser">
        Offering a configuration form here would imply an account system. Saying what is missing is the useful answer instead.
      </Notice>
    </Stack>
  );
}

function PolicySimulator({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record) return <NoProject />;
  const role = model.roles.find((item) => item.id === payload?.id) ?? model.roles[0];
  if (!role) return <Empty title="No role to simulate" icon={<ShieldCheck size={20} />} />;
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Role", value: role.name },
        { label: "Can approve", value: role.canApprove ? "Yes" : "No" },
      ]} />
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">What {role.name} may do</caption>
          <thead><tr><th scope="col">Entity</th><th scope="col">Read</th><th scope="col">Write</th><th scope="col">Screens affected</th></tr></thead>
          <tbody>
            {model.entities.map((entity) => {
              const grant = role.grants[entity.id] ?? "none";
              const screens = model.screens.filter((screen) => screen.components.some((component) => component.entityId === entity.id));
              return (
                <tr key={entity.id}>
                  <th scope="row">{entity.name}</th>
                  <td>{grant !== "none" ? <Pill tone="success">yes</Pill> : <Pill tone="neutral">no</Pill>}</td>
                  <td>{grant === "write" ? <Pill tone="warning">yes</Pill> : <Pill tone="neutral">no</Pill>}</td>
                  <td>{screens.map((screen) => screen.name).join(", ") || <span className="ds-subtle">none</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" onClick={() => { useBuildUi.getState().setPreviewRole(role.id); context.closeOverlay(); context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder?tab=Preview`); }}>
        Open the preview as {role.name}
      </Button>
      <Notice tone="warning" title="A simulation, not enforcement">
        The preview hides what this role cannot read so the design can be judged. The built app would still have to enforce the same matrix on a server.
      </Notice>
    </Stack>
  );
}

function IncidentInspector({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const failing = validateApp(model).filter((issue) => issue.level === "fail");
  return (
    <Stack gap={3}>
      <Notice tone={failing.length ? "danger" : "success"} title={failing.length ? `${failing.length} failing ${failing.length === 1 ? "check" : "checks"}` : "Nothing is failing"}>
        {failing.length
          ? "There is no runtime to raise an incident, so the honest equivalent is a failing check on the design."
          : "The model is consistent. A runtime incident cannot be reported because nothing runs."}
      </Notice>
      <Stack gap={2}>
        {failing.map((issue) => (
          <div key={issue.id} className="t6-check" data-state="fail">
            <span className="t6-check-dot" aria-hidden="true" />
            <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
            <Pill tone="danger">{issue.area}</Pill>
          </div>
        ))}
      </Stack>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/incidents`)}>Open the incident queue</Button>
    </Stack>
  );
}

function TaskCreation({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record } = useAppRecord(context);
  const { now } = useWorkspace();
  if (!record) return <NoProject />;
  return (
    <form
      id="task-creation"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const created = await context.mutate.create({
          collection: "tasks",
          title: String(data.get("title") ?? "Work on the app"),
          status: "ready",
          summary: String(data.get("note") ?? ""),
          dueAt: String(data.get("due") || "") || undefined,
          at: now.toISOString(),
          fields: { stage: "ready", assignee: context.actor, project: record.title },
        }, `Task created from ${record.title}`);
        context.toast("Task created", `${created.title} is in the task list for ${context.org.shortName}.`);
        close();
      }}
    >
      <Field label="What needs doing" required><TextInput name="title" required defaultValue="" /></Field>
      <Field label="Due"><TextInput name="due" type="date" /></Field>
      <Field label="Detail"><TextArea name="note" rows={3} /></Field>
      <Notice tone="info">The task is created in this workspace against {record.title}, not in an external tracker.</Notice>
    </form>
  );
}

function RequestBuilder({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  return (
    <form
      id="request-builder"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const endpoint = {
          id: `ep-${Date.now().toString(36)}`,
          method: String(data.get("method") ?? "GET") as "GET" | "POST" | "PATCH" | "DELETE",
          path: String(data.get("path") ?? "/"),
          entityId: String(data.get("entityId") ?? ""),
          auth: (data.get("auth") === "none" ? "none" : "role") as "none" | "role",
          note: String(data.get("note") ?? ""),
        };
        await saveApp(context, record, { ...model, endpoints: [...model.endpoints, endpoint] }, `Endpoint ${endpoint.method} ${endpoint.path} defined`);
        context.toast("Endpoint defined", endpoint.auth === "none" ? "It is marked open, which the list shows in red." : "It requires a role.");
        close();
      }}
    >
      <Row gap={2}>
        <Field label="Method">
          <Select name="method" defaultValue="GET">{["GET", "POST", "PATCH", "DELETE"].map((method) => <option key={method} value={method}>{method}</option>)}</Select>
        </Field>
        <Field label="Path" required><TextInput name="path" defaultValue="/quotes" required /></Field>
      </Row>
      <Field label="Entity">
        <Select name="entityId" defaultValue={model.entities[0]?.id ?? ""}>
          {model.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
        </Select>
      </Field>
      <Field label="Authorisation">
        <Select name="auth" defaultValue="role">
          <option value="role">A role is required</option>
          <option value="none">Open — no role required</option>
        </Select>
      </Field>
      <Field label="Note"><TextInput name="note" placeholder="Used by the quote board" /></Field>
      <Notice tone="warning" title="Removing a role check is never quiet">
        Authorisation is part of the generated request type, so an open endpoint changes the contract file and shows up in a review.
      </Notice>
    </form>
  );
}

function AuthInspector({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record) return <NoProject />;
  const endpoint = model.endpoints.find((item) => item.id === payload?.id) ?? model.endpoints[0];
  if (!endpoint) return <Empty title="No endpoint defined" icon={<Code2 size={20} />} />;
  const entity = model.entities.find((item) => item.id === endpoint.entityId);
  const allowed = model.roles.filter((role) => (role.grants[endpoint.entityId] ?? "none") !== "none");
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Endpoint", value: <span className="ds-num">{`${endpoint.method} ${endpoint.path}`}</span> },
        { label: "Entity", value: entity?.name ?? "Missing" },
        { label: "Authorisation", value: <Pill tone={endpoint.auth === "role" ? "success" : "danger"} dot>{endpoint.auth === "role" ? "role required" : "open"}</Pill> },
        { label: "Roles that could call it", value: allowed.map((role) => role.name).join(", ") || "None" },
      ]} />
      {endpoint.auth === "none" && (
        <Notice tone="danger" title="This endpoint has no role requirement">
          Anything that can reach the server could call it. If that is deliberate, say so in the note so a later reader does not treat it as a mistake.
        </Notice>
      )}
      <Button variant="secondary" onClick={() => void saveApp(context, record, {
        ...model,
        endpoints: model.endpoints.map((item) => (item.id === endpoint.id ? { ...item, auth: item.auth === "role" ? "none" : "role" } : item)),
      }, `Authorisation on ${endpoint.method} ${endpoint.path} changed to ${endpoint.auth === "role" ? "open" : "role required"}`)}>
        {endpoint.auth === "role" ? "Make it open" : "Require a role"}
      </Button>
    </Stack>
  );
}

function RoleEditorForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  return (
    <form
      id="role-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const name = String(data.get("name") ?? "").trim();
        if (!name) return;
        const role = {
          id: `ro-${Date.now().toString(36)}`,
          name,
          grants: Object.fromEntries(model.entities.map((entity) => [entity.id, "none" as const])),
          canApprove: false,
        };
        await saveApp(context, record, { ...model, roles: [...model.roles, role] }, `Role ${name} created with no access`);
        context.toast("Role created", `${name} starts with no access to any entity. Grant it deliberately on the roles table.`);
        close();
      }}
    >
      <Field label="Role name" required><TextInput name="name" required placeholder="Reviewer" /></Field>
      <Notice tone="info" title="A new role starts closed">
        It is created with no access to any entity and no approval right. Nothing is inherited from the workspace owner, so widening it is always a deliberate, recorded act.
      </Notice>
    </form>
  );
}

function BudgetPanel({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const bytes = generatedFiles(model).reduce((sum, file) => sum + new TextEncoder().encode(file.content).length, 0);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Hosting spend", value: <span className="ds-num">{context.money(0)}</span> },
        { label: "Database spend", value: <span className="ds-num">{context.money(0)}</span> },
        { label: "Generated output", value: <span className="ds-num">{`${(bytes / 1024).toFixed(1)} kB`}</span> },
        { label: "Forecast", value: <Pill tone="warning">Unavailable</Pill> },
      ]} />
      <Notice tone="info" title="A forecast needs a price list and a volume">
        Neither exists here. The measured figures are shown and the forecast is left blank rather than modelled from an assumption.
      </Notice>
    </Stack>
  );
}

function TraceViewer({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const screen = model.screens[0];
  const steps = screen
    ? screen.components.filter((component) => component.kind !== "text").map((component) => {
      const entity = model.entities.find((item) => item.id === component.entityId);
      return { label: `${component.title} → ${entity?.collection || "unbound"}`, bound: Boolean(entity?.collection) };
    })
    : [];
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There are no runtime traces">
        A trace comes from a request. Nothing serves one. What can be shown is the read path the preview takes when it renders a screen, which is below.
      </Notice>
      <div className="t6-wf">
        {steps.map((step, index) => (
          <div key={step.label} className="t6-wf-row">
            <span className="ds-truncate">{step.label}</span>
            <span className="t6-wf-track"><i className="t6-wf-bar" data-tone={step.bound ? undefined : "warning"} style={{ left: `${index * 6}%`, width: step.bound ? "42%" : "12%" }} /></span>
            <span className="ds-num">{step.bound ? "indexed" : "no read"}</span>
          </div>
        ))}
        {steps.length === 0 && <span className="ds-subtle">No data components to trace.</span>}
      </div>
      <Notice tone="info" title="No personal data is in a read path summary">
        The rows name the component and the collection, never a record or a field value, so a summary can be shared without carrying anyone's details.
      </Notice>
    </Stack>
  );
}

function AlertRule({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const totals = issueTotals(validateApp(model));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Failing checks now", value: <span className="ds-num">{String(totals.fail)}</span> },
        { label: "Alert when", value: "A check that was passing starts failing" },
        { label: "Delivery", value: <Pill tone="warning" dot>Not connected</Pill> },
      ]} />
      <Checkbox label="Write an attention item when a model check starts failing" defaultChecked />
      <BoundaryNotice id="email.send" action="Sending an alert" />
    </Stack>
  );
}

export const buildApp = registerApp({
  code: "BUILD",
  short: "App Builder",
  name: "App Builder & Development",
  purpose: "Model the data, design the screens, read the code it generates",
  icon: Boxes,
  nav: [
    { items: [{ label: "Projects", screenId: "ARL-BUILD-001", icon: Boxes }] },
    {
      label: "This project", items: [
        { label: "Overview", screenId: "ARL-BUILD-002", icon: Gauge },
        { label: "Builder", screenId: "ARL-BUILD-003", icon: LayoutTemplate },
        { label: "Data model", screenId: "ARL-BUILD-005", icon: Database },
        { label: "Code", screenId: "ARL-BUILD-004", icon: Code2 },
        { label: "API", screenId: "ARL-BUILD-006", icon: Workflow },
      ],
    },
    {
      label: "Ship", items: [
        { label: "Roles", screenId: "ARL-BUILD-007", icon: ShieldCheck },
        { label: "Checks", screenId: "ARL-BUILD-008", icon: TestTube2 },
        { label: "Deployments", screenId: "ARL-BUILD-009", icon: Rocket },
        { label: "Integrations", screenId: "ARL-BUILD-010", icon: KeyRound },
        { label: "Monitoring", screenId: "ARL-BUILD-011", icon: Gauge },
      ],
    },
  ],
  screens: {
    "ARL-BUILD-001": {
      id: "ARL-BUILD-001",
      subtitle: (context) => `App projects in ${context.org.name}. Nothing is deployed, so no project is described as running.`,
      tabs: (["Recent", "Team", "Templates", "Archived"] as const).map((scope) => ({
        id: scope,
        render: (context: ScreenContext) => <ProjectLibrary context={context} scope={scope} />,
      })),
      actions: [
        { id: "Create", label: "New project", placement: "primary", run: (context) => context.openOverlay("Project setup") },
        {
          id: "open", label: "Open", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select a project first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/build/projects/${context.selectedId}`),
        },
        { id: "import repo", label: "Import a repository", placement: "overflow", run: (context) => context.openOverlay("Git import") },
        {
          id: "clone", label: "Clone", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a project first"),
          run: async (context) => {
            const repo = await import("@/platform/repo");
            const source = await repo.getRecord(context.selectedId ?? "");
            if (!source) { context.toast("Nothing to clone", "Select a project row first.", "blocked"); return; }
            const body = source.body && typeof source.body === "object" ? { ...(source.body as Record<string, unknown>), releases: [], versions: [] } : source.body;
            const created = await context.mutate.create({
              collection: "appProjects", title: `${source.title} copy`, status: "draft",
              summary: source.summary, fields: { ...source.fields, delivery: "not_connected" }, body,
            }, `App project ${source.title} cloned`);
            context.toast("Project cloned", `${created.title} has the same model and no release history.`);
          },
        },
      ],
      overlays: [
        { id: "Project setup", kind: "modal", title: "New project", width: 620, render: ({ close, ...context }) => <ProjectSetupForm context={context} close={close} />, footer: submitFooter("project-setup", "Create the project") },
        { id: "Git import", kind: "modal", title: "Import a repository", width: 560, render: ({ ...context }) => <GitImportPanel context={context} />, footer: closeFooter() },
        {
          id: "environment config", kind: "drawer", title: "Environment", width: 460,
          render: ({ ...context }) => (
            <Stack gap={3}>
              <Notice tone="warning" title="An environment here is a label, not a machine">
                It changes how every surface colours this project so a staging snapshot is never mistaken for production. Nothing runs in any of them.
              </Notice>
              <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${context.selectedId ?? ""}/deploy`)}>Open deployments</Button>
            </Stack>
          ),
        },
      ],
    },

    "ARL-BUILD-002": {
      id: "ARL-BUILD-002",
      title: () => "Application overview",
      subtitle: (context) => `The state of this project in ${context.org.shortName}, measured from the model.`,
      tabs: (["Overview", "Pages", "Data", "Tests", "Deployments"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AppOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Open builder", label: "Open the builder", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/build/projects/${context.params.id ?? ""}/builder`) },
        { id: "run tests", label: "Run the checks", placement: "secondary", run: (context) => context.setTab("Tests") },
        { id: "create issue", label: "Create a task", placement: "overflow", run: (context) => context.openOverlay("task creation") },
        { id: "ask engineer", label: "Failing checks", placement: "overflow", run: (context) => context.openOverlay("Incident inspector") },
      ],
      overlays: [
        { id: "Incident inspector", kind: "drawer", title: "Failing checks", width: 520, render: ({ ...context }) => <IncidentInspector context={context} /> },
        { id: "release preview", kind: "modal", title: "Release review", width: 620, render: ({ close, ...context }) => <ReleaseApproval context={context} close={close} /> },
        { id: "task creation", kind: "modal", title: "Create a task", width: 520, render: ({ close, ...context }) => <TaskCreation context={context} close={close} />, footer: submitFooter("task-creation", "Create the task") },
      ],
    },

    "ARL-BUILD-003": {
      id: "ARL-BUILD-003",
      chrome: "full",
      surface: (context) => <AppBuilder context={context} />,
      tabs: ["Design", "Logic", "Data", "Responsive", "Preview"].map((id) => ({
        id,
        render: (context: ScreenContext) => <AppBuilder context={context} />,
      })),
      actions: [
        { id: "Add component", label: "Add a component", placement: "primary", run: (context) => { context.setTab("Design"); context.toast("Palette ready", "Press a component to add it after the selection, or drag it onto a position."); } },
        {
          id: "bind record", label: "Bind the selection", placement: "secondary",
          guard: () => (useBuildUi.getState().componentId ? undefined : "Select a component first"),
          run: (context) => context.openOverlay("Component inspector"),
        },
        { id: "edit styles", label: "Widths", placement: "overflow", run: (context) => context.setTab("Responsive") },
        { id: "simulate", label: "Run the preview", placement: "overflow", run: (context) => context.setTab("Preview") },
      ],
      overlays: [
        { id: "Component inspector", kind: "drawer", title: "Component", width: 460, render: ({ ...context }) => <ComponentInspectorOverlay context={context} /> },
        { id: "expression editor", kind: "modal", title: "Automation", width: 640, render: ({ close, ...context }) => <ExpressionEditor context={context} close={close} />, footer: submitFooter("expression-editor", "Save automation") },
        { id: "binding test", kind: "drawer", title: "Binding test", width: 520, render: ({ ...context }) => <BindingTest context={context} /> },
      ],
    },

    "ARL-BUILD-004": {
      id: "ARL-BUILD-004",
      title: () => "Code",
      subtitle: () => "Readable TypeScript generated from the model, regenerated on every read so it cannot drift.",
      tabs: (["Files", "Source control", "Problems", "Tests"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CodeScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Edit", label: "Edit the model instead", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/build/projects/${context.params.id ?? ""}/builder?tab=Data`) },
        { id: "search", label: "Search the files", placement: "secondary", run: (context) => context.openOverlay("File search") },
        { id: "commit", label: "Review the output", placement: "overflow", run: (context) => context.openOverlay("diff review") },
        { id: "run safe command", label: "Run a command", placement: "overflow", run: (context) => context.openOverlay("command authorization") },
        { id: "branch", label: "Change history", placement: "overflow", run: (context) => context.setTab("Source control") },
      ],
      overlays: [
        { id: "File search", kind: "modal", title: "Search the generated files", width: 620, render: ({ ...context }) => <FileSearch context={context} />, footer: closeFooter() },
        { id: "diff review", kind: "drawer", title: "Generated output", width: 640, render: ({ ...context }) => <DiffReview context={context} /> },
        { id: "command authorization", kind: "modal", title: "Run a command", tone: "danger", width: 560, render: ({ ...context }) => <CommandAuthorization context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-BUILD-005": {
      id: "ARL-BUILD-005",
      title: () => "Data model",
      subtitle: () => "Entities, fields and relations, validated as you change them.",
      tabs: (["Schema", "Data", "Migrations", "Policies"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <DatabaseScreen context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Create table", label: "New entity", placement: "primary",
          run: async (context) => {
            const repo = await import("@/platform/repo");
            const projects = await repo.listByCollection(context.org.id, "appProjects");
            const record = projects.find((item) => item.id === context.params.id) ?? projects[0];
            if (!record) return;
            const { readApp, makeEntity } = await import("./model");
            const model = readApp(record);
            const created = makeEntity(`Entity ${model.entities.length + 1}`);
            await saveApp(context, record, { ...model, entities: [...model.entities, created] }, `Entity ${created.name} created`);
            useBuildUi.getState().selectEntity(created.id);
            context.toast("Entity created", `${created.name} has two starting fields. Rename it and bind a collection.`);
          },
        },
        { id: "alter schema", label: "Field detail", placement: "secondary", run: (context) => context.openOverlay("Column editor") },
        { id: "validate policy", label: "Access policy", placement: "overflow", run: (context) => context.setTab("Policies") },
        { id: "seed", label: "Migration check", placement: "overflow", run: (context) => context.openOverlay("migration diff") },
      ],
      overlays: [
        { id: "Column editor", kind: "modal", title: "Field", width: 560, render: ({ close, ...context }) => <ColumnEditor context={context} close={close} />, footer: submitFooter("column-editor", "Save field") },
        { id: "migration diff", kind: "drawer", title: "Migration diff", width: 640, render: ({ ...context }) => <MigrationDiff context={context} /> },
        {
          id: "access policy", kind: "drawer", title: "Access policy", width: 520,
          render: ({ ...context }) => <MigrationPanel context={context} />,
        },
      ],
    },

    "ARL-BUILD-006": {
      id: "ARL-BUILD-006",
      title: () => "API & functions",
      subtitle: () => "Contracts, not a running service. Authorisation is part of the generated type.",
      tabs: (["Endpoints", "Functions", "Contracts", "Runs"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ApiScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Define endpoint", label: "Define an endpoint", placement: "primary", run: (context) => context.openOverlay("Request builder") },
        { id: "test", label: "Authorisation", placement: "secondary", run: (context) => context.openOverlay("auth inspector") },
        { id: "deploy", label: "Contracts", placement: "overflow", run: (context) => context.setTab("Contracts") },
        { id: "inspect trace", label: "Function source", placement: "overflow", run: (context) => context.setTab("Functions") },
      ],
      overlays: [
        { id: "Request builder", kind: "modal", title: "Endpoint", width: 580, render: ({ close, ...context }) => <RequestBuilder context={context} close={close} />, footer: submitFooter("request-builder", "Define the endpoint") },
        { id: "auth inspector", kind: "drawer", title: "Authorisation", width: 520, render: ({ ...context }) => <AuthInspector context={context} /> },
        { id: "function diff", kind: "drawer", title: "Generated contracts", width: 640, render: ({ ...context }) => <DiffReview context={context} /> },
      ],
    },

    "ARL-BUILD-007": {
      id: "ARL-BUILD-007",
      title: () => "Roles & access",
      subtitle: () => "A new person inherits nothing. Granting access is always deliberate and recorded.",
      tabs: (["Users", "Roles", "Sessions", "Providers"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AuthScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create role", label: "New role", placement: "primary", run: (context) => context.openOverlay("Role editor") },
        { id: "configure provider", label: "Providers", placement: "secondary", run: (context) => context.setTab("Providers") },
        { id: "revoke session", label: "Sessions", placement: "overflow", run: (context) => context.setTab("Sessions") },
      ],
      overlays: [
        { id: "Role editor", kind: "modal", title: "New role", width: 520, render: ({ close, ...context }) => <RoleEditorForm context={context} close={close} />, footer: submitFooter("role-editor", "Create the role") },
        { id: "policy simulator", kind: "drawer", title: "Policy simulation", width: 580, render: ({ ...context }) => <PolicySimulator context={context} /> },
        { id: "authentication issue", kind: "modal", title: "What this method needs", width: 520, render: ({ ...context }) => <AuthIssuePanel context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-BUILD-008": {
      id: "ARL-BUILD-008",
      title: () => "Checks & QA",
      subtitle: () => "These suites read the model. A passing result means the design is consistent, not that a feature works.",
      tabs: (["Suites", "Runs", "Coverage", "Issues"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <TestsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Run suite", label: "Run the suites", placement: "primary", run: (context) => context.setTab("Suites") },
        { id: "inspect failure", label: "Open the report", placement: "secondary", run: (context) => context.openOverlay("Test report") },
        { id: "approve fix", label: "Proposed changes", placement: "overflow", run: (context) => context.openOverlay("AI patch review") },
        { id: "export", label: "Flaky checks", placement: "overflow", run: (context) => context.openOverlay("flaky test tracker") },
      ],
      overlays: [
        { id: "Test report", kind: "drawer", title: "Check report", width: 600, render: ({ ...context }) => <TestReport context={context} /> },
        {
          id: "AI patch review", kind: "drawer", title: "Proposed change", width: 560,
          render: ({ ...context }) => (
            <Stack gap={3}>
              <BoundaryNotice id="model.inference" action="Proposing a fix" />
              <Notice tone="info" title="What a proposal would have to carry">
                The exact model change, the checks it turns green, the checks it leaves failing, and a way to reject it that leaves the model untouched. Until a model provider is connected, no proposal exists to review.
              </Notice>
              <Button variant="secondary" onClick={() => context.setTab("Issues")}>Read the failing checks instead</Button>
            </Stack>
          ),
        },
        {
          id: "flaky test tracker", kind: "modal", title: "Flaky checks", width: 520,
          render: () => (
            <Stack gap={3}>
              <Notice tone="info" title="None of these checks can be flaky">
                Every check here is a pure function of the model: the same model always gives the same result. Flakiness comes from timing, networks and shared state, none of which are involved.
              </Notice>
              <Properties rows={[
                { label: "Non-deterministic checks", value: <span className="ds-num">0</span> },
                { label: "Reason", value: "The suites read the model and nothing else" },
              ]} />
            </Stack>
          ),
          footer: closeFooter(),
        },
      ],
    },

    "ARL-BUILD-009": {
      id: "ARL-BUILD-009",
      title: () => "Deployments",
      subtitle: () => "Promotion stops at the runtime boundary, and the attempt is recorded as blocked rather than rewritten.",
      tabs: (["Environments", "Releases", "Logs", "Rollbacks"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <DeployScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Promote", label: "Promote", placement: "primary", run: (context) => context.openOverlay("Release approval", { environment: "production" }) },
        { id: "rollback", label: "Roll back", placement: "secondary", run: (context) => context.openOverlay("rollback impact") },
        { id: "inspect config", label: "Environments", placement: "overflow", run: (context) => context.setTab("Environments") },
        { id: "pause", label: "Build logs", placement: "overflow", run: (context) => context.setTab("Logs") },
      ],
      overlays: [
        { id: "Release approval", kind: "modal", title: "Release review", width: 640, render: ({ close, ...context }) => <ReleaseApproval context={context} close={close} /> },
        { id: "diff", kind: "drawer", title: "Generated output", width: 640, render: ({ ...context }) => <DiffReview context={context} /> },
        { id: "rollback impact", kind: "modal", title: "Rollback", width: 540, render: ({ ...context }) => <RollbackImpact context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-BUILD-010": {
      id: "ARL-BUILD-010",
      title: () => "Integrations & keys",
      subtitle: () => "No credential is stored in this browser, and none is generated.",
      tabs: (["Connections", "Secrets", "Webhooks", "Health"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <IntegrationsScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Attach integration", label: "Integration directory", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/connect/marketplace`) },
        { id: "test", label: "Health", placement: "secondary", run: (context) => context.setTab("Health") },
        { id: "rotate secret", label: "Keys", placement: "overflow", run: (context) => context.openOverlay("Secret input") },
        { id: "revoke", label: "Webhooks", placement: "overflow", run: (context) => context.setTab("Webhooks") },
      ],
      overlays: [
        {
          id: "Secret input", kind: "modal", title: "Keys", tone: "danger", width: 560,
          render: () => (
            <Stack gap={3}>
              <Notice tone="danger" title="There is no field to type a key into">
                A credential written here would sit in IndexedDB in plain text. Rather than offer a form that looks safe, this workspace stores no secret at all and generates none.
              </Notice>
              <Properties rows={[
                { label: "Stored secrets", value: <span className="ds-num">0</span> },
                { label: "Generated credentials", value: <span className="ds-num">0</span> },
                { label: "Where they would belong", value: "A server with an encrypted store, once one exists" },
              ]} />
            </Stack>
          ),
          footer: closeFooter(),
        },
        {
          id: "webhook test", kind: "modal", title: "Webhook test", width: 520,
          render: () => (
            <Notice tone="warning" title="A webhook cannot be tested from here">
              Testing means sending a request and reading the response. This workspace makes no network calls, so the result would be fabricated. No test is offered.
            </Notice>
          ),
          footer: closeFooter(),
        },
        {
          id: "revocation", kind: "modal", title: "Revocation", width: 520,
          render: ({ ...context }) => (
            <Stack gap={3}>
              <Notice tone="info" title="There is no grant to revoke">
                Nothing has been authorised, so nothing can be withdrawn. Connections are managed in the integrations application, where the same state is shown once.
              </Notice>
              <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/connections`)}>Open installed connections</Button>
            </Stack>
          ),
          footer: closeFooter(),
        },
      ],
    },

    "ARL-BUILD-011": {
      id: "ARL-BUILD-011",
      title: () => "Monitoring",
      subtitle: () => "Nothing runs, so runtime figures are blank. What the design can be measured on is measured.",
      tabs: (["Errors", "Performance", "Usage", "Costs"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <MonitorScreen context={context} lens={lens} />,
      })),
      actions: [
        { id: "Inspect event", label: "Read path", placement: "primary", run: (context) => context.openOverlay("Trace viewer") },
        { id: "create incident", label: "Failing checks", placement: "secondary", run: (context) => context.openOverlay("Incident inspector") },
        { id: "tune monitor", label: "Alert rule", placement: "overflow", run: (context) => context.openOverlay("alert rule") },
        { id: "export", label: "Budget", placement: "overflow", run: (context) => context.openOverlay("budget panel") },
      ],
      overlays: [
        { id: "Trace viewer", kind: "drawer", title: "Read path", width: 580, render: ({ ...context }) => <TraceViewer context={context} /> },
        { id: "alert rule", kind: "modal", title: "Alert rule", width: 520, render: ({ ...context }) => <AlertRule context={context} />, footer: closeFooter() },
        { id: "budget panel", kind: "drawer", title: "Budget", width: 480, render: ({ ...context }) => <BudgetPanel context={context} /> },
        { id: "Incident inspector", kind: "drawer", title: "Failing checks", width: 520, render: ({ ...context }) => <IncidentInspector context={context} /> },
      ],
    },
  },
});

function FileSearch({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const [query, setQuery] = useState("");
  if (!record) return <NoProject />;
  const files = generatedFiles(model);
  const hits = query.trim()
    ? files.flatMap((file) => file.content.split("\n").map((line, index) => ({ file: file.path, line: index + 1, text: line }))
      .filter((row) => row.text.toLowerCase().includes(query.trim().toLowerCase())))
    : [];
  return (
    <Stack gap={3}>
      <Field label="Search the generated files"><TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="interface" autoFocus /></Field>
      {query.trim() === "" ? (
        <p className="ds-subtle">Type to search {files.length} generated files.</p>
      ) : hits.length === 0 ? (
        <Notice tone="neutral" title="No match">Nothing in the generated output contains that text.</Notice>
      ) : (
        <Stack gap={1}>
          {hits.slice(0, 40).map((hit) => (
            <Row key={`${hit.file}-${hit.line}`} gap={2}>
              <span className="ds-num ds-subtle" style={{ width: 130 }}>{hit.file.replace("src/", "")}:{hit.line}</span>
              <code className="ds-truncate ds-grow">{hit.text.trim()}</code>
            </Row>
          ))}
          <span className="ds-subtle">{hits.length} matches.</span>
        </Stack>
      )}
    </Stack>
  );
}

function TestReport({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const payload = context.overlayPayload as { area?: string } | undefined;
  if (!record) return <NoProject />;
  const issues = validateApp(model).filter((issue) => (payload?.area ? issue.area === payload.area : true));
  const totals = issueTotals(issues);
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Suite", value: payload?.area ?? "All" },
        { label: "Checks", value: <span className="ds-num">{String(issues.length)}</span> },
        { label: "Failing", value: <Pill tone={totals.fail ? "danger" : "neutral"}>{totals.fail}</Pill> },
        { label: "To review", value: <Pill tone={totals.warn ? "warning" : "neutral"}>{totals.warn}</Pill> },
        { label: "Passing", value: <Pill tone="success">{totals.pass}</Pill> },
      ]} />
      <Stack gap={2}>
        {issues.map((issue) => (
          <div key={issue.id} className="t6-check" data-state={issue.level}>
            <span className="t6-check-dot" aria-hidden="true" />
            <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
            <Pill tone={issue.level === "fail" ? "danger" : issue.level === "warn" ? "warning" : "success"}>{issue.level}</Pill>
          </div>
        ))}
      </Stack>
      <Notice tone="warning" title="A green suite is not a working feature">
        These checks read the model. They say the design is consistent; they cannot say the built app behaves correctly, because nothing executes it.
      </Notice>
    </Stack>
  );
}

function RollbackImpact({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  if (!record) return <NoProject />;
  const releases = [...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const latest = releases[0];
  const previous = releases.find((release) => release.state === "built");
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Latest attempt", value: latest ? <span className="ds-num">{context.dateTime(latest.at)}</span> : "None" },
        { label: "Outcome", value: latest ? latest.state.replace("_", " ") : "None" },
        { label: "Earlier build", value: previous ? <span className="ds-num">{context.dateTime(previous.at)}</span> : "None recorded" },
        { label: "Revisions kept", value: <span className="ds-num">{String(record.history.length)}</span> },
      ]} />
      {!latest ? (
        <Notice tone="neutral" title="Nothing to roll back">No release has been attempted for this project.</Notice>
      ) : (
        <>
          <Notice tone="info" title="A rollback here restores the model">
            Nothing is running, so a rollback means writing an earlier revision of the model back onto the record. {record.history.length} revisions are kept.
          </Notice>
          <Button
            variant="outline-danger"
            disabled={record.history.length === 0}
            onClick={async () => {
              const snapshot = record.history[0];
              await context.mutate.patch(record.id, { body: snapshot.body }, { event: `Model rolled back to the revision saved ${snapshot.at}` });
              await saveApp(context, { ...record, body: snapshot.body, revision: record.revision + 1 }, {
                ...model,
                releases: model.releases.map((release) => (release.id === latest.id ? { ...release, state: "rolled_back" as const, note: "Rolled back to the previous model revision." } : release)),
              }, "Release marked rolled back");
              context.toast("Rolled back", "The previous model revision was written back and the release is marked rolled back.");
            }}
          >
            Roll back to the previous revision
          </Button>
        </>
      )}
    </Stack>
  );
}
