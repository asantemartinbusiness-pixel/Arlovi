import { useState } from "react";
import "./library.css";
import { Activity, Boxes, Code2, GitBranch, KeyRound, Rocket, ShieldCheck, TestTube2 } from "lucide-react";
import {
  BarChart, Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useWorkspace } from "@/platform/workspace";
import { freshness, wallMs } from "@/platform/clock";
import type { Rec } from "@/domain/types";
import { BoundaryNotice, CapabilityState, downloadCsv, downloadFile } from "@/applications/t6kit/kit";
import {
  COMPONENT_LABELS, FIELD_KIND_LABELS, generatedFiles, issueTotals, readApp, validateApp,
  type AppModel, type Automation, type ModelIssue, type Release,
} from "./model";
import { NoProject, useAppRecord } from "./builder";
import { ScreenPreview } from "./preview";
import { SeedRows } from "./actions";
import { saveApp, useBuildUi } from "./state";
import { NO_INTERACTION } from "./binding";
import type { ScreenComponent } from "./model";

/** Template components start with every record shown and no interaction. */
const unfiltered = (): Pick<ScreenComponent, "filters" | "sort" | "limit" | "interaction"> => ({ filters: [], sort: null, limit: 0, interaction: NO_INTERACTION });

/* ================================================================ *
 * ARL-BUILD-001 — App Project Library
 * ================================================================ */

export function ProjectLibrary({ context, scope }: { context: ScreenContext; scope: "Recent" | "Team" | "Templates" | "Archived" }) {
  const projects = useCollection("appProjects");
  const { org, now } = useWorkspace();
  const [search, setSearch] = useState("");
  const active = projects.filter((project) => project.status !== "archived");
  const matching = (text: string) => text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const libraryOverview = (
    <section className="t6-build-library-overview" aria-label="Build project overview">
      <Row gap={3} wrap><div className="ds-grow" style={{ minWidth: 220 }}>
        <span className="ds-subtle">BUILD / APP PROJECTS</span>
        <h2>Build an application, not just a screen.</h2>
        <p className="ds-subtle">Shape data, design workflows and validate releases from one connected project workspace.</p>
      </div><Button size="sm" variant="primary" onClick={() => context.openOverlay("Project setup")}>New project</Button></Row>
      <div className="t6-build-library-metrics" aria-label="Build project activity">
        <div><span>Active projects</span><strong>{active.length}</strong></div>
        <div><span>Drafts</span><strong>{active.filter((project) => project.status === "draft").length}</strong></div>
        <div><span>Entities</span><strong>{active.reduce((count, project) => count + readApp(project).entities.length, 0)}</strong></div>
        <div><span>Screens</span><strong>{active.reduce((count, project) => count + readApp(project).screens.length, 0)}</strong></div>
      </div>
    </section>
  );

  if (scope === "Templates") {
    const templates = PROJECT_TEMPLATES.filter((template) => matching(`${template.title} ${template.summary} ${template.build().entities.map((entity) => entity.name).join(" ")}`));
    return (
      <Stack gap={4}>
        {libraryOverview}
        <Field label="Find a template"><TextInput type="search" aria-label="Find a template" value={search} placeholder="Search templates or business use cases" onChange={(event) => setSearch(event.target.value)} /></Field>
        {templates.length === 0 ? <Empty title="No templates match this search" icon={<Boxes size={20} />} action={<Button variant="secondary" onClick={() => setSearch("")}>Clear search</Button>}>Try a different industry, entity or workflow.</Empty> : <Grid>
        {templates.map((template) => (
          <Card key={template.id} span={6} title={template.title} subtitle={template.summary}
            footer={<Button size="sm" variant="primary" onClick={async () => {
              const created = await context.mutate.create({
                collection: "appProjects", title: template.title, status: "draft",
                summary: template.summary, fields: { delivery: "not_connected" },
                body: template.build(),
              }, `App project created from the ${template.title} template`);
              context.toast("Project created", `${created.title} has ${template.build().entities.length} entities and ${template.build().screens.length} screens.`);
              context.navigate(`/o/${org.slug}/build/projects/${created.id}/builder`);
            }}>Start from this</Button>}>
            <Properties rows={[
              { label: "Entities", value: template.build().entities.map((entity) => entity.name).join(", ") },
              { label: "Screens", value: template.build().screens.map((screen) => screen.name).join(", ") },
              { label: "Reads", value: template.build().entities.map((entity) => entity.collection).filter(Boolean).join(", ") || "Nothing yet" },
            ]} />
          </Card>
        ))}
      </Grid>}
      </Stack>
    );
  }

  const rows = projects.filter((record) => {
    if (scope === "Archived") return record.status === "archived";
    if (record.status === "archived") return false;
    return true;
  }).filter((record) => matching(`${record.title} ${record.summary} ${record.ownerName ?? ""} ${record.status} ${readApp(record).entities.map((entity) => entity.name).join(" ")}`))
    .sort((left, right) => scope === "Recent"
      ? right.updatedAt.localeCompare(left.updatedAt)
      : left.title.localeCompare(right.title));

  if (rows.length === 0) {
    return <Stack gap={4}>{libraryOverview}<Field label="Find a project"><TextInput type="search" aria-label="Find a project" value={search} placeholder="Search projects, owners and entities" onChange={(event) => setSearch(event.target.value)} /></Field><Empty title={search.trim() ? "No projects match this search" : scope === "Archived" ? "Nothing archived" : "No app projects"} icon={<Boxes size={20} />} action={<Button variant="secondary" onClick={() => search.trim() ? setSearch("") : context.openOverlay("Project setup")}>{search.trim() ? "Clear search" : "New project"}</Button>}>{search.trim() ? "Try searching by project name, owner or entity." : "An app project links its data model, screens and validated workflow."}</Empty></Stack>;
  }

  return (
    <Stack gap={4}>
      {libraryOverview}
      <Field label="Find a project"><TextInput type="search" aria-label="Find a project" value={search} placeholder="Search projects, owners and entities" onChange={(event) => setSearch(event.target.value)} /></Field>
    <DataGrid
      rows={rows}
      rowId={(row) => row.id}
      label="App projects"
      columns={[
        { key: "title", header: "Project", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
        { key: "entities", header: "Entities", align: "end", cell: (row) => String(readApp(row).entities.length), sortValue: (row) => readApp(row).entities.length },
        { key: "screens", header: "Screens", align: "end", cell: (row) => String(readApp(row).screens.length) },
        { key: "environment", header: "Environment", cell: (row) => <Pill tone={readApp(row).settings.environment === "production" ? "danger" : readApp(row).settings.environment === "staging" ? "warning" : "neutral"} dot>{readApp(row).settings.environment}</Pill> },
        {
          key: "model", header: "Model", cell: (row) => {
            const totals = issueTotals(validateApp(readApp(row)));
            return totals.fail ? <Pill tone="danger">{totals.fail} failing</Pill> : totals.warn ? <Pill tone="warning">{totals.warn} to review</Pill> : <Pill tone="success">valid</Pill>;
          },
        },
        { key: "runtime", header: "Runtime", cell: () => <Pill tone="warning">Not deployed</Pill> },
        { key: "updated", header: "Updated", align: "end", cell: (row) => `${freshness(row.updatedAt, now).days} days ago`, sortValue: (row) => row.updatedAt },
      ]}
      onOpen={(id) => context.navigate(`/o/${org.slug}/build/projects/${id}`)}
      onSelect={(id) => context.select(id)}
      selectedId={context.selectedId}
      summary={<span>Runtime is blank for every project: nothing is deployed from this browser, so no project is described as running.</span>}
    />
    </Stack>
  );
}

const PROJECT_TEMPLATES: { id: string; title: string; summary: string; build: () => AppModel }[] = [
  {
    id: "desk",
    title: "Quote desk",
    summary: "Quotes against companies, with a value total and a status board.",
    build: () => ({
      entities: [
        { id: "e-company", name: "Company", collection: "companies", fields: [
          { id: "f-name", name: "Name", kind: "text", required: true, unique: true, options: [], references: "" },
          { id: "f-owner", name: "Owner", kind: "text", required: false, unique: false, options: [], references: "" },
        ] },
        { id: "e-quote", name: "Quote", collection: "quotes", fields: [
          { id: "q-title", name: "Title", kind: "text", required: true, unique: false, options: [], references: "" },
          { id: "q-amount", name: "Amount", kind: "money", required: true, unique: false, options: [], references: "" },
          { id: "q-status", name: "Status", kind: "choice", required: true, unique: false, options: ["draft", "sent", "accepted", "declined"], references: "" },
          { id: "q-company", name: "Company", kind: "reference", required: false, unique: false, options: [], references: "Company" },
        ] },
      ],
      screens: [
        { id: "s-board", name: "Quote board", route: "/quotes", components: [
          { id: "c-stat", kind: "stat", title: "Open quotes", entityId: "e-quote", fieldIds: [], aggregate: "count", text: "", span: 4, ...unfiltered(),
            filters: [{ id: "f-open-1", fieldId: "q-status", operator: "not_equals", value: "accepted" }, { id: "f-open-2", fieldId: "q-status", operator: "not_equals", value: "declined" }] },
          { id: "c-value", kind: "stat", title: "Quoted value", entityId: "e-quote", fieldIds: ["q-amount"], aggregate: "sum", text: "", span: 4 , ...unfiltered() },
          { id: "c-chart", kind: "chart", title: "By status", entityId: "e-quote", fieldIds: ["q-status"], aggregate: "count", text: "", span: 4 , ...unfiltered() },
          { id: "c-table", kind: "table", title: "Quotes", entityId: "e-quote", fieldIds: ["q-title", "q-amount", "q-status"], aggregate: "count", text: "", span: 12 , ...unfiltered() },
        ] },
      ],
      automations: [],
      roles: [
        { id: "r-owner", name: "Owner", grants: { "e-company": "write", "e-quote": "write" }, canApprove: true },
        { id: "r-member", name: "New member", grants: { "e-company": "read", "e-quote": "read" }, canApprove: false },
      ],
      versions: [],
      endpoints: [],
      releases: [],
      files: [],
      settings: { name: "Quote desk", description: "Quotes against companies.", environment: "preview", locale: "en-GB" },
    }),
  },
  {
    id: "tickets",
    title: "Support queue",
    summary: "Tickets with a priority and an owner, and a count by state.",
    build: () => ({
      entities: [
        { id: "e-ticket", name: "Ticket", collection: "tickets", fields: [
          { id: "t-title", name: "Title", kind: "text", required: true, unique: false, options: [], references: "" },
          { id: "t-status", name: "Status", kind: "choice", required: true, unique: false, options: ["open", "waiting", "resolved"], references: "" },
          { id: "t-owner", name: "Owner", kind: "text", required: false, unique: false, options: [], references: "" },
        ] },
      ],
      screens: [
        { id: "s-queue", name: "Queue", route: "/queue", components: [
          { id: "c-open", kind: "stat", title: "Tickets", entityId: "e-ticket", fieldIds: [], aggregate: "count", text: "", span: 4 , ...unfiltered() },
          { id: "c-by", kind: "chart", title: "By state", entityId: "e-ticket", fieldIds: ["t-status"], aggregate: "count", text: "", span: 8 , ...unfiltered() },
          { id: "c-list", kind: "table", title: "All tickets", entityId: "e-ticket", fieldIds: ["t-title", "t-status", "t-owner"], aggregate: "count", text: "", span: 12, ...unfiltered(), sort: { fieldId: "t-status", direction: "asc" } },
        ] },
      ],
      automations: [],
      roles: [{ id: "r-agent", name: "Agent", grants: { "e-ticket": "write" }, canApprove: false }],
      versions: [],
      endpoints: [],
      releases: [],
      files: [],
      settings: { name: "Support queue", description: "Tickets with a priority and an owner.", environment: "preview", locale: "en-GB" },
    }),
  },
];

export function ProjectSetupForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const projects = useCollection("appProjects");
  const [title, setTitle] = useState("");
  const [templateId, setTemplateId] = useState(PROJECT_TEMPLATES[0].id);
  const duplicate = projects.some((record) => record.title.trim().toLowerCase() === title.trim().toLowerCase());
  const template = PROJECT_TEMPLATES.find((item) => item.id === templateId) ?? PROJECT_TEMPLATES[0];
  return (
    <form
      id="project-setup"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const model = template.build();
        const created = await context.mutate.create({
          collection: "appProjects", title: title.trim(), status: "draft",
          summary: template.summary, fields: { delivery: "not_connected" },
          body: { ...model, settings: { ...model.settings, name: title.trim() } },
        }, `App project ${title.trim()} created`);
        context.toast("Project created", `${created.title} opens in the builder.`);
        close();
        context.navigate(`/o/${context.org.slug}/build/projects/${created.id}/builder`);
      }}
    >
      <Field label="Project name" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required /></Field>
      {duplicate && <Notice tone="danger" title="A project with that name exists">Generated package names would collide.</Notice>}
      <Field label="Start from">
        <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
          {PROJECT_TEMPLATES.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Card title="What the template defines" subtitle={template.summary}>
        <Properties rows={[
          { label: "Entities", value: template.build().entities.map((entity) => `${entity.name} (${entity.fields.length} fields)`).join(", ") },
          { label: "Screens", value: template.build().screens.map((screen) => `${screen.name} ${screen.route}`).join(", ") },
          { label: "Roles", value: template.build().roles.map((role) => role.name).join(", ") },
        ]} />
      </Card>
      <Notice tone="info" title="Bound to real collections">
        Each entity names a collection in this workspace, so the preview shows records that exist rather than sample rows.
      </Notice>
    </form>
  );
}

export function GitImportPanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Field label="Repository address"><TextInput placeholder="https://github.com/example/app.git" /></Field>
      <Notice tone="warning" title="A repository cannot be fetched from here">
        Cloning needs a network call, and this workspace makes none. Nothing is downloaded, nothing is executed, and no imported code is run in this browser.
      </Notice>
      <Notice tone="info" title="What an import would have to do first">
        Read the manifest without running it, list the dependencies for review, and keep every file read-only until someone approves it. Until a connection exists, the honest state is that import is unavailable.
      </Notice>
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.openOverlay("Project setup"); }}>Start from a template instead</Button>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-BUILD-002 — Application Overview
 * ================================================================ */

export function AppOverview({ context, lens }: { context: ScreenContext; lens: "Overview" | "Pages" | "Data" | "Tests" | "Deployments" }) {
  const { record, model } = useAppRecord(context);
  const events = useEvents(record?.id);
  const ui = useBuildUi();
  if (!record) return <NoProject />;
  const issues = validateApp(model);
  const totals = issueTotals(issues);
  const lastRelease = [...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];

  if (lens === "Overview") {
    return (
      <Stack gap={5}>
        <section className="t6-build-library-overview" aria-label="Build project health overview">
          <Row gap={3} wrap>
            <div className="ds-grow" style={{ minWidth: 220 }}>
              <span className="ds-subtle">BUILD / PROJECT OVERVIEW</span>
              <h2>{record.title}</h2>
              <p className="ds-subtle">Your application model, screen architecture, validation findings and delivery state in one workspace.</p>
            </div>
            <Row gap={2} wrap>
              <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder`)}>Open builder</Button>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/tests`)}>Run through checks</Button>
            </Row>
          </Row>
          <div className="t6-build-library-metrics" aria-label="Project readiness summary">
            <div><span>Screens</span><strong>{model.screens.length}</strong></div>
            <div><span>Components</span><strong>{model.screens.reduce((count, screen) => count + screen.components.length, 0)}</strong></div>
            <div><span>Checks failing</span><strong>{totals.fail}</strong></div>
            <div><span>Checks to review</span><strong>{totals.warn}</strong></div>
          </div>
        </section>
        <StatRow>
          <Stat prov="posted" label="Entities" value={String(model.entities.length)} meta={`${model.entities.reduce((sum, entity) => sum + entity.fields.length, 0)} fields`} />
          <Stat prov="posted" label="Screens" value={String(model.screens.length)} meta={`${model.screens.reduce((sum, screen) => sum + screen.components.length, 0)} components`} />
          <Stat prov="posted" label="Model checks" value={`${totals.fail} failing`} meta={`${totals.warn} to review · ${totals.pass} passing`} onClick={() => context.setTab("Tests")} />
          <Stat label="Deployed" value="Not deployed" unavailable meta="No runtime is connected" />
        </StatRow>
        <Grid>
          <Card span={7} eyebrow="RELEASE" prov="posted" title="Release state" subtitle={lastRelease ? `Last attempt ${context.dateTime(lastRelease.at)}` : "Never attempted"}
            footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/deploy`)}>Deployments</Button>}>
            <Properties rows={[
              { label: "Environment label", value: <Pill tone={model.settings.environment === "production" ? "danger" : model.settings.environment === "staging" ? "warning" : "neutral"} dot>{model.settings.environment}</Pill> },
              { label: "Last outcome", value: lastRelease ? lastRelease.state.replace("_", " ") : "None" },
              { label: "Hosting", value: <CapabilityState id="site.publish" /> },
            ]} />
            <BoundaryNotice id="site.publish" action="Deploying this app" />
          </Card>
          <Card span={5} eyebrow="BACKLOG" prov="posted" title="Backlog" subtitle={`${totals.fail + totals.warn} items from the model itself`}>
            {totals.fail + totals.warn === 0 ? <Notice tone="success" title="Nothing outstanding">Every check on the model passes.</Notice> : (
              <Stack gap={2}>
                {issues.filter((issue) => issue.level !== "pass").slice(0, 6).map((issue) => (
                  <Row key={issue.id} gap={2}>
                    <span className="ds-grow ds-truncate">{issue.title}</span>
                    <Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.area}</Pill>
                  </Row>
                ))}
              </Stack>
            )}
          </Card>
          <Card span={7} eyebrow="ACTIVITY" prov="posted" title="Activity" subtitle="Audit events on this project">
            {events.length === 0 ? <Empty title="Nothing recorded yet" /> : (
              <Stack gap={2}>
                {events.slice(0, 6).map((event) => (
                  <div key={event.id}>
                    <strong style={{ fontSize: "var(--text-sm)" }}>{event.message}</strong>
                    <div className="ds-subtle">{event.actor} · {context.relative(event.at)}</div>
                  </div>
                ))}
              </Stack>
            )}
          </Card>
          <Card span={5} eyebrow="ACCESS" prov="human" title="Users" subtitle="Roles defined in this app">
            <Stack gap={2}>
              {model.roles.map((role) => (
                <Row key={role.id} gap={2}>
                  <span className="ds-grow">{role.name}</span>
                  <Pill tone={Object.values(role.grants).includes("write") ? "warning" : "neutral"}>
                    {Object.values(role.grants).filter((grant) => grant === "write").length} write
                  </Pill>
                  {role.canApprove && <Pill tone="info">approves</Pill>}
                </Row>
              ))}
              {model.roles.length === 0 && <span className="ds-subtle">No roles defined.</span>}
            </Stack>
          </Card>
        </Grid>
      </Stack>
    );
  }

  if (lens === "Pages") {
    return model.screens.length === 0
      ? <Empty title="No screens yet" icon={<Boxes size={20} />} action={<Button variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder`)}>Open the builder</Button>} />
      : (
        <DataGrid
          rows={model.screens}
          rowId={(row) => row.id}
          label="Screens"
          columns={[
            { key: "name", header: "Screen", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => row.name },
            { key: "route", header: "Route", cell: (row) => <code>{row.route}</code> },
            { key: "components", header: "Components", align: "end", cell: (row) => String(row.components.length) },
            { key: "kinds", header: "Kinds", cell: (row) => [...new Set(row.components.map((item) => COMPONENT_LABELS[item.kind]))].join(", ") || "—" },
            { key: "bound", header: "Bound", cell: (row) => {
              const unbound = row.components.filter((item) => item.kind !== "text" && !model.entities.some((entity) => entity.id === item.entityId)).length;
              return unbound ? <Pill tone="danger">{unbound} unbound</Pill> : <Pill tone="success">all bound</Pill>;
            } },
          ]}
          onOpen={(id) => { ui.setScreen(id); context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder`); }}
        />
      );
  }

  if (lens === "Data") {
    return (
      <Stack gap={4}>
        <div className="t6-entities">
          {model.entities.map((entity) => (
            <div key={entity.id} className="t6-entity">
              <header>
                <strong className="ds-grow">{entity.name}</strong>
                <Pill tone={entity.collection ? "success" : "warning"}>{entity.collection || "unbound"}</Pill>
              </header>
              {entity.fields.map((field) => (
                <div key={field.id} className="t6-entity-field">
                  <span className="ds-grow">{field.name}</span>
                  <code>{FIELD_KIND_LABELS[field.kind]}{field.kind === "reference" ? ` → ${field.references || "?"}` : ""}</code>
                  {field.required && <Pill tone="warning">req</Pill>}
                </div>
              ))}
              {entity.fields.length === 0 && <div className="t6-entity-field"><span className="ds-subtle">No fields.</span></div>}
            </div>
          ))}
        </div>
        {model.entities.length === 0 && <Empty title="No entities" icon={<Boxes size={20} />} />}
        <Notice tone="info" title="A bound entity reads real records">
          {model.entities.filter((entity) => entity.collection).length} of {model.entities.length} entities name a workspace collection. The rest show their shape but have nothing to read.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Tests") {
    return <TestsScreen context={context} lens="Suites" />;
  }

  return <DeployScreen context={context} lens="Environments" />;
}

/* ================================================================ *
 * ARL-BUILD-004 — Code Editor
 * ================================================================ */

export function CodeScreen({ context, lens }: { context: ScreenContext; lens: "Files" | "Source control" | "Problems" | "Tests" }) {
  const { record, model } = useAppRecord(context);
  const events = useEvents(record?.id);
  const [path, setPath] = useState("src/types.ts");
  if (!record) return <NoProject />;
  const files = [...generatedFiles(model), ...model.files];
  const file = files.find((item) => item.path === path) ?? files[0];
  const issues = validateApp(model).filter((issue) => issue.level !== "pass");
  const generatedCount = generatedFiles(model).length;
  const codeOverview = (
    <section className="t6-build-library-overview" aria-label="Build generated code overview">
      <Row gap={2} wrap>
        <div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / SOURCE WORKSPACE</span><h2>Understand what your model generates.</h2><p className="ds-subtle">Inspect generated files, project-owned additions, model diagnostics and change history without confusing this view with a connected Git repository.</p></div>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder`)}>Back to builder</Button>
      </Row>
      <div className="t6-build-library-metrics" aria-label="Generated code status">
        <div><span>Generated files</span><strong>{generatedCount}</strong></div>
        <div><span>Project files</span><strong>{model.files.length}</strong></div>
        <div><span>Problems</span><strong>{issues.filter((issue) => issue.level === "fail").length}</strong></div>
        <div><span>To review</span><strong>{issues.filter((issue) => issue.level === "warn").length}</strong></div>
      </div>
    </section>
  );

  if (lens === "Source control") {
    const changes = events.filter((event) => /entity|field|screen|component|automation|role/i.test(event.message));
    return (
      <Stack gap={4}>
        {codeOverview}
        <Notice tone="info" title="The model is the source of truth">
          There is no repository here. Every change to the model writes an audit event, and the generated files are produced from the model each time they are read, so they cannot drift.
        </Notice>
        {changes.length === 0 ? <Empty title="No model changes recorded" icon={<GitBranch size={20} />} /> : (
          <DataGrid
            rows={changes}
            rowId={(row) => row.id}
            label="Model changes"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "actor", header: "Who", cell: (row) => row.actor },
              { key: "message", header: "Change", cell: (row) => row.message, filterValue: (row) => row.message },
            ]}
          />
        )}
        <Row gap={2}>
          <Button variant="secondary" onClick={() => context.openOverlay("diff review")}>Review the generated output</Button>
          <Button variant="ghost" onClick={() => context.openOverlay("command authorization")}>Run a command</Button>
        </Row>
      </Stack>
    );
  }

  if (lens === "Problems") {
    return (
      <Stack gap={4}>
        {codeOverview}
        {issues.length === 0 ? <Notice tone="success" title="No model problems detected">The model diagnostics have no failures or warnings. A runtime build and execution still require separate verification.</Notice> : (
          <Stack gap={2}>{issues.map((issue) => (
            <div key={issue.id} className="t6-check" data-state={issue.level}>
              <span className="t6-check-dot" aria-hidden="true" />
              <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
              <Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.area}</Pill>
            </div>
          ))}</Stack>
        )}
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/tests`)}>Review model checks</Button>
      </Stack>
    );
  }

  if (lens === "Tests") {
    return <TestsScreen context={context} lens="Runs" />;
  }

  return (
    <Stack gap={4}>
      {codeOverview}
    <Grid>
      <Card span={4} title="Files" subtitle={`${files.length} files`}>
        <Stack gap={1}>
          {files.map((item) => (
            <button key={item.path} type="button" className="ds-record-card" aria-current={item.path === file?.path ? "true" : undefined} onClick={() => setPath(item.path)}>
              <Row gap={2}>
                <span className="ds-grow ds-truncate ds-num" style={{ textAlign: "start", fontSize: "var(--text-xs)" }}>{item.path}</span>
                <Pill tone={item.path.startsWith("src/") && generatedFiles(model).some((generated) => generated.path === item.path) ? "accent" : "neutral"}>
                  {generatedFiles(model).some((generated) => generated.path === item.path) ? "generated" : "kept"}
                </Pill>
              </Row>
              <span className="ds-subtle">{item.content.split("\n").length} lines</span>
            </button>
          ))}
        </Stack>
      </Card>
      <Card span={8} title={file?.path ?? "No file"} subtitle={generatedFiles(model).some((generated) => generated.path === file?.path) ? "Generated from the model; edit the model to change it" : "Kept with the project"}
        footer={<>
          <Button size="sm" variant="secondary" onClick={() => { if (file) { downloadFile(file.path.split("/").pop() ?? "file.ts", file.content, "text/plain"); context.toast("File downloaded", `${file.path} was written to a file in this browser.`); } }}>Download</Button>
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("File search")}>Search</Button>
        </>}>
        <pre className="t6-code">{file?.content ?? "// No file selected"}</pre>
      </Card>
    </Grid>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-BUILD-005 — Database Designer (Data and Migrations)
 * ================================================================ */

export function DatabaseScreen({ context, lens }: { context: ScreenContext; lens: "Schema" | "Data" | "Migrations" | "Policies" }) {
  const { record, model } = useAppRecord(context);
  const ui = useBuildUi();
  const collections = useCollection(model.entities.find((entity) => entity.id === ui.entityId)?.collection || model.entities[0]?.collection || "tasks");
  if (!record) return <NoProject />;
  const entity = model.entities.find((item) => item.id === ui.entityId) ?? model.entities[0];
  const issues = validateApp(model).filter((issue) => issue.area === "Data");

  if (lens === "Schema") {
    return <EntityDesignerBridge context={context} record={record} model={model} />;
  }

  if (lens === "Data") {
    if (!entity) return <Empty title="No entity" icon={<Boxes size={20} />} />;
    if (!entity.collection) {
      return (
        <Stack gap={4}>
          <SeedRows entityId={entity.id} app={model} />
          <Notice tone="warning" title={`${entity.name} is not bound to a collection`}>
            Bind it on the schema tab and this tab shows the real records it would read. No sample rows are invented to fill the space.
          </Notice>
          <Button variant="secondary" onClick={() => context.setTab("Schema")}>Bind it</Button>
        </Stack>
      );
    }
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Pill tone="success">{entity.name} → {entity.collection}</Pill>
          <span className="ds-subtle">{collections.length} records in {context.org.name}</span>
        </Row>
        <SeedRows entityId={entity.id} app={model} />
        {collections.length === 0 ? <Empty title={`No ${entity.collection} records in this organisation`} /> : (
          <DataGrid
            rows={collections}
            rowId={(row) => row.id}
            label={`${entity.name} records`}
            columns={entity.fields.slice(0, 5).map((field, index) => ({
              key: field.id,
              header: field.name,
              primary: index === 0,
              cell: (row: Rec) => {
                const key = field.name.toLowerCase();
                if (key === "title" || key === "name") return row.title;
                if (key === "status") return <Pill tone="neutral">{row.status}</Pill>;
                if (field.kind === "money") return context.money(row.amountMinor);
                return String(row.fields[field.name] ?? row.fields[key] ?? "—");
              },
              filterValue: (row: Rec) => `${row.title} ${row.status}`,
            }))}
          />
        )}
        <Notice tone="info" title="These are workspace records, not a copy">
          The designer reads the live collection. Nothing is duplicated into the app project, so a record cannot be stale here.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Migrations") {
    return <MigrationPanel context={context} />;
  }

  return (
    <Grid>
      <Card span={12} title="Access policy" subtitle="Which role may read or write which entity">
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Role and entity permissions</caption>
            <thead>
              <tr><th scope="col">Role</th>{model.entities.map((item) => <th key={item.id} scope="col">{item.name}</th>)}<th scope="col">Approves</th></tr>
            </thead>
            <tbody>
              {model.roles.map((role) => (
                <tr key={role.id}>
                  <th scope="row">{role.name}</th>
                  {model.entities.map((item) => {
                    const grant = role.grants[item.id] ?? "none";
                    return <td key={item.id}><Pill tone={grant === "write" ? "warning" : grant === "read" ? "success" : "neutral"}>{grant}</Pill></td>;
                  })}
                  <td>{role.canApprove ? <Pill tone="info">yes</Pill> : <span className="ds-subtle">no</span>}</td>
                </tr>
              ))}
              {model.roles.length === 0 && <tr><td colSpan={model.entities.length + 2}>No roles defined.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      <Card span={12} title="What the checks say" subtitle={`${issues.filter((issue) => issue.level !== "pass").length} to look at`}>
        <Stack gap={2}>
          {issues.filter((issue) => issue.level !== "pass").map((issue) => (
            <div key={issue.id} className="t6-check" data-state={issue.level}>
              <span className="t6-check-dot" aria-hidden="true" />
              <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
              <Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.level}</Pill>
            </div>
          ))}
          {issues.filter((issue) => issue.level !== "pass").length === 0 && <Notice tone="success" title="The data model is consistent">Every reference resolves and no field name is used twice.</Notice>}
        </Stack>
      </Card>
      <Card span={12} title="Role views are not a server">
        <Notice tone="warning" title="This matrix shapes the interface">
          The preview hides what a role cannot read, which is useful for designing the app. It is not enforcement: everything here runs in one browser, and a built app would have to enforce the same matrix on its own server.
        </Notice>
      </Card>
    </Grid>
  );
}

function EntityDesignerBridge({ context, record, model }: { context: ScreenContext; record: Rec; model: AppModel }) {
  return <EntityDesignerImpl context={context} record={record} model={model} />;
}

import { EntityDesigner as EntityDesignerImpl } from "./builder";

export function MigrationPanel({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const ui = useBuildUi();
  const entity = model.entities.find((item) => item.id === ui.entityId) ?? model.entities[0];
  const rows = useCollection(entity?.collection || "tasks");
  if (!record) return <NoProject />;
  if (!entity) return <Empty title="No entity to migrate" icon={<Boxes size={20} />} />;
  const previous = record.history[0]?.body as { entities?: { id: string; name: string; fields: { id: string; name: string }[] }[] } | undefined;
  const before = previous?.entities?.find((item) => item.id === entity.id);
  const removed = before ? before.fields.filter((field) => !entity.fields.some((item) => item.id === field.id)) : [];
  const added = before ? entity.fields.filter((field) => !before.fields.some((item) => item.id === field.id)) : [];

  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Entity", value: entity.name },
        { label: "Reads", value: entity.collection || "Not bound" },
        { label: "Records that would be touched", value: entity.collection ? String(rows.length) : "Unknown until it is bound" },
        { label: "Compared against", value: record.history.length ? `Revision ${record.revision - 1}` : "No earlier revision recorded" },
      ]} />
      {!before ? (
        <Notice tone="info" title="No earlier shape to compare against">
          This project has no stored revision of {entity.name} yet. Change the schema once and the next comparison is real rather than assumed.
        </Notice>
      ) : (
        <Grid>
          <Card span={6} title="Fields added" subtitle={`${added.length}`}>
            {added.length === 0 ? <span className="ds-subtle">None.</span> : <Stack gap={1}>{added.map((field) => <Row key={field.id} gap={2}><span className="ds-grow">{field.name}</span><Pill tone="success">added</Pill></Row>)}</Stack>}
          </Card>
          <Card span={6} title="Fields removed" subtitle={`${removed.length}`}>
            {removed.length === 0 ? <span className="ds-subtle">None.</span> : <Stack gap={1}>{removed.map((field) => <Row key={field.id} gap={2}><span className="ds-grow">{field.name}</span><Pill tone="danger">removed</Pill></Row>)}</Stack>}
          </Card>
        </Grid>
      )}
      {removed.length > 0 && (
        <Notice tone="danger" title="A destructive change needs a copy first">
          Removing {removed.map((field) => field.name).join(", ")} drops the values those fields hold on {entity.collection ? `${rows.length} records` : "every record"}. Export them before the change is applied, and the export button below writes a real file.
        </Notice>
      )}
      <Row gap={2} wrap>
        <Button variant="secondary" disabled={!entity.collection} onClick={() => {
          downloadCsv(
            `${context.org.slug}-${entity.name.toLowerCase()}-backup.csv`,
            ["id", "title", "status", ...entity.fields.map((field) => field.name)],
            rows.map((row) => [row.id, row.title, row.status, ...entity.fields.map((field) => String(row.fields[field.name] ?? ""))]),
          );
          void context.mutate.log(`Backed up ${rows.length} ${entity.collection} records before a schema change to ${entity.name}`, { entityId: record.id, type: "export" });
          context.toast("Backup written", `${rows.length} records exported to CSV before any change.`);
        }}>Export a backup first</Button>
        <Button variant="ghost" onClick={() => context.openOverlay("migration diff")}>See the generated diff</Button>
      </Row>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-BUILD-006 — API & Functions
 * ================================================================ */

export function ApiScreen({ context, lens }: { context: ScreenContext; lens: "Endpoints" | "Functions" | "Contracts" | "Runs" }) {
  const { record, model } = useAppRecord(context);
  const events = useEvents(record?.id);
  if (!record) return <NoProject />;

  if (lens === "Endpoints") {
    return (
      <Stack gap={4}>
        <section className="t6-build-library-overview" aria-label="API contract overview">
          <Row gap={2} wrap><div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / API CONTRACT OVERVIEW</span><h2>Design API contracts with clear permissions.</h2><p className="ds-subtle">Review method, entity binding and authorisation before generating contracts. Endpoints are designs, not hosted services.</p></div></Row>
          <div className="t6-build-library-metrics" aria-label="API contract overview metrics">
            <div><span>Endpoints</span><strong>{model.endpoints.length}</strong></div>
            <div><span>Role protected</span><strong>{model.endpoints.filter((endpoint) => endpoint.auth === "role").length}</strong></div>
            <div><span>Open contracts</span><strong>{model.endpoints.filter((endpoint) => endpoint.auth === "none").length}</strong></div>
            <div><span>Automations</span><strong>{model.automations.length}</strong></div>
          </div>
        </section>
        <Row gap={2}><Button variant="primary" onClick={() => context.openOverlay("Request builder")}>Define an endpoint</Button></Row>
        {model.endpoints.length === 0 ? (
          <Empty title="No endpoints defined" icon={<Code2 size={20} />}>An endpoint here is a contract: a method, a path, the entity it touches and whether it requires a role.</Empty>
        ) : (
          <DataGrid
            rows={model.endpoints}
            rowId={(row) => row.id}
            label="Endpoints"
            columns={[
              { key: "method", header: "Method", primary: true, cell: (row) => <Pill tone={row.method === "GET" ? "neutral" : row.method === "DELETE" ? "danger" : "info"}>{row.method}</Pill> },
              { key: "path", header: "Path", cell: (row) => <code>{row.path}</code>, filterValue: (row) => row.path },
              { key: "entity", header: "Entity", cell: (row) => model.entities.find((item) => item.id === row.entityId)?.name ?? <Pill tone="danger">missing</Pill> },
              { key: "auth", header: "Authorisation", cell: (row) => <Pill tone={row.auth === "role" ? "success" : "danger"} dot>{row.auth === "role" ? "role required" : "open"}</Pill> },
              { key: "note", header: "Note", cell: (row) => row.note },
            ]}
            onOpen={(id) => context.openOverlay("auth inspector", { id })}
            summary={<span>An endpoint marked open is shown in red, because removing authorisation is the kind of change that should never be quiet.</span>}
          />
        )}
        <Notice tone="warning" title="These contracts do not run">
          Nothing in this workspace serves a request. The endpoints are a design the generated code describes, so the shape can be reviewed before anyone writes a server.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Functions") {
    return (
      <Stack gap={4}>
        {model.automations.length === 0 ? (
          <Empty title="No functions yet" icon={<Code2 size={20} />}>An automation on the logic tab is the function body: a trigger, a condition and steps.</Empty>
        ) : (
          <Grid>
            {model.automations.map((automation) => (
              <Card key={automation.id} span={6} title={automation.name} subtitle={`on ${automation.trigger.replace("_", " ")}`}
                actions={<Pill tone={automation.enabled ? "success" : "neutral"} dot>{automation.enabled ? "enabled" : "paused"}</Pill>}>
                <pre className="t6-code" style={{ maxHeight: 200 }}>{automationSource(automation, model)}</pre>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    );
  }

  if (lens === "Contracts") {
    return (
      <Stack gap={4}>
        <Card eyebrow="GENERATED" prov="human" title="Generated contracts" subtitle="src/api.ts, produced from the endpoint list">
          <pre className="t6-code">{generatedFiles(model).find((file) => file.path === "src/api.ts")?.content ?? ""}</pre>
        </Card>
        <Notice tone="info" title="Authorisation is part of the type">
          Each request type carries its authorisation requirement, so removing a role check changes the generated contract and shows up in a review rather than passing unnoticed.
        </Notice>
      </Stack>
    );
  }

  const runs = events.filter((event) => /automation|endpoint|function/i.test(event.message));
  return runs.length === 0
    ? <Empty title="No runs recorded" icon={<Activity size={20} />}>Nothing executes here. When an automation is edited or paused the change is recorded, and those records are this list.</Empty>
    : (
      <DataGrid
        rows={runs}
        rowId={(row) => row.id}
        label="Function activity"
        columns={[
          { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
          { key: "actor", header: "Who", cell: (row) => row.actor },
          { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
        ]}
      />
    );
}

function automationSource(automation: Automation, model: AppModel): string {
  const entity = model.entities.find((item) => item.id === automation.entityId);
  const field = entity?.fields.find((item) => item.id === automation.condition.fieldId);
  const name = automation.name.replace(/[^A-Za-z0-9]+(.)?/g, (_, chr: string | undefined) => (chr ? chr.toUpperCase() : ""));
  return `export function ${name.charAt(0).toLowerCase() + name.slice(1) || "automation"}(record: ${entity ? entity.name.replace(/\s+/g, "") : "unknown"}) {
  // trigger: ${automation.trigger}
  ${field ? `if (!(record.${field.name.replace(/\s+/g, "")} ${automation.condition.operator === "equals" ? "===" : automation.condition.operator === "greater_than" ? ">" : "<"} ${JSON.stringify(automation.condition.value)})) return;` : "// no condition set"}
${automation.steps.map((step) => `  ${step.kind === "notify" ? "// notify is not connected: the intention is recorded instead" : ""}\n  ${step.kind}(${JSON.stringify(step.detail)});`).join("\n")}
}`;
}

/* ================================================================ *
 * ARL-BUILD-007 — Authentication & Roles
 * ================================================================ */

export function AuthScreen({ context, lens }: { context: ScreenContext; lens: "Users" | "Roles" | "Sessions" | "Providers" }) {
  const { record, model } = useAppRecord(context);
  const members = useCollection("members");
  if (!record) return <NoProject />;

  if (lens === "Roles") {
    return (
      <Stack gap={4}>
        <section className="t6-build-library-overview" aria-label="Access policy overview">
          <Row gap={2} wrap><div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / ACCESS POLICY OVERVIEW</span><h2>Make access intentional and reviewable.</h2><p className="ds-subtle">Assign role grants per entity and inspect approval authority. Preview permissions do not replace server enforcement.</p></div></Row>
          <div className="t6-build-library-metrics" aria-label="Access policy overview metrics">
            <div><span>Roles</span><strong>{model.roles.length}</strong></div>
            <div><span>Entities</span><strong>{model.entities.length}</strong></div>
            <div><span>Write grants</span><strong>{model.roles.reduce((n, role) => n + Object.values(role.grants).filter((grant) => grant === "write").length, 0)}</strong></div>
            <div><span>Approvers</span><strong>{model.roles.filter((role) => role.canApprove).length}</strong></div>
          </div>
        </section>
        <Row gap={2}><Button variant="primary" onClick={() => context.openOverlay("Role editor")}>New role</Button></Row>
        <div className="t6-matrix-wrap">
          <table className="t6-matrix">
            <caption className="ds-sr-only">Roles and what each may do</caption>
            <thead><tr><th scope="col">Role</th>{model.entities.map((entity) => <th key={entity.id} scope="col">{entity.name}</th>)}<th scope="col">Approves</th><th scope="col" /></tr></thead>
            <tbody>
              {model.roles.map((role) => (
                <tr key={role.id}>
                  <th scope="row">{role.name}</th>
                  {model.entities.map((entity) => (
                    <td key={entity.id}>
                      <Select
                        aria-label={`${role.name} access to ${entity.name}`}
                        value={role.grants[entity.id] ?? "none"}
                        onChange={(event) => void saveApp(context, record, {
                          ...model,
                          roles: model.roles.map((item) => (item.id === role.id ? { ...item, grants: { ...item.grants, [entity.id]: event.target.value as "none" | "read" | "write" } } : item)),
                        }, `${role.name} access to ${entity.name} set to ${event.target.value}`)}
                      >
                        <option value="none">none</option>
                        <option value="read">read</option>
                        <option value="write">write</option>
                      </Select>
                    </td>
                  ))}
                  <td><Checkbox label="" aria-label={`${role.name} can approve`} checked={role.canApprove}
                    onChange={(event) => void saveApp(context, record, { ...model, roles: model.roles.map((item) => (item.id === role.id ? { ...item, canApprove: event.target.checked } : item)) }, `${role.name} approval changed`)} /></td>
                  <td><Button size="sm" variant="ghost" onClick={() => context.openOverlay("policy simulator", { id: role.id })}>Simulate</Button></td>
                </tr>
              ))}
              {model.roles.length === 0 && <tr><td colSpan={model.entities.length + 3}>No roles defined.</td></tr>}
            </tbody>
          </table>
        </div>
        <Notice tone="warning" title="A new person inherits nothing">
          The role named for new people starts with no write access and never inherits the workspace owner's rights. Granting access is always a deliberate act recorded in the audit log.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Users") {
    const defaultRole = model.roles.find((role) => /new|member|default/i.test(role.name)) ?? model.roles[model.roles.length - 1];
    return (
      <Stack gap={4}>
        <Notice tone="info" title="People come from the workspace directory">
          This app has no user table of its own. The people below are members of {context.org.name}, and the role each would hold in the app is shown beside them.
        </Notice>
        <DataGrid
          rows={members}
          rowId={(row) => row.id}
          label="People"
          columns={[
            { key: "name", header: "Person", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
            { key: "kind", header: "Kind", cell: (row) => <Pill tone={row.fields.kind === "ai" ? "accent" : "neutral"}>{row.fields.kind === "ai" ? "AI employee" : "Person"}</Pill> },
            { key: "role", header: "Role in this app", cell: (row) => (row.fields.role === "owner" ? model.roles[0]?.name ?? "—" : defaultRole?.name ?? "—") },
            { key: "write", header: "Can write", cell: (row) => {
              const role = row.fields.role === "owner" ? model.roles[0] : defaultRole;
              return role && Object.values(role.grants).includes("write") ? <Pill tone="warning">yes</Pill> : <span className="ds-subtle">no</span>;
            } },
          ]}
        />
      </Stack>
    );
  }

  if (lens === "Sessions") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="There are no sessions to list">
          A session exists when a server issues one. This app has no server, so there is no session table, no token and nothing to revoke. Listing an invented session would be worse than listing none.
        </Notice>
        <Card title="What this browser can actually say" subtitle="Read at the moment the panel rendered">
          <Properties rows={[
            { label: "Workspace actor", value: context.actor },
            { label: "Role view", value: context.role },
            { label: "Storage", value: "IndexedDB in this browser profile" },
            { label: "Token", value: <Pill tone="warning">None issued</Pill> },
          ]} />
        </Card>
      </Stack>
    );
  }

  return (
    <Grid>
      {["Email and password", "Single sign-on", "Passkey"].map((provider) => (
        <Card key={provider} span={4} title={provider} actions={<Pill tone="warning" dot>Not connected</Pill>}>
          <Stack gap={2}>
            <p className="ds-subtle">{provider === "Single sign-on" ? "Would need an identity provider and a verified domain." : provider === "Passkey" ? "Would need a relying party registered against a real origin." : "Would need a server that can store a password hash."}</p>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("authentication issue", { provider })}>What it would take</Button>
          </Stack>
        </Card>
      ))}
      <Card span={12} title="Why none of these can be configured here">
        <Notice tone="warning" title="Authentication needs a server">
          Every method above depends on something outside this browser: a password store, an identity provider or a registered origin. Offering a configuration form for them would imply an account system that does not exist.
        </Notice>
      </Card>
    </Grid>
  );
}

/* ================================================================ *
 * ARL-BUILD-008 — Testing & QA
 * ================================================================ */

export function TestsScreen({ context, lens }: { context: ScreenContext; lens: "Suites" | "Runs" | "Coverage" | "Issues" }) {
  const { record, model } = useAppRecord(context);
  const events = useEvents(record?.id);
  const { now } = useWorkspace();
  if (!record) return <NoProject />;
  const issues = validateApp(model);
  const totals = issueTotals(issues);
  const lastRun = String(record.fields.lastCheckAt ?? "");
  const testOverview = (
    <section className="t6-build-library-overview" aria-label="Build checks overview">
      <Row gap={2} wrap>
        <div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / MODEL CHECKS</span><h2>Understand readiness before release.</h2><p className="ds-subtle">Review design consistency, inspect failures and confirm what still requires a real runtime.</p></div>
        <Row gap={2} wrap><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder`)}>Builder</Button><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/deploy`)}>Release review</Button></Row>
      </Row>
      <div className="t6-build-library-metrics" aria-label="Model check summary">
        <div><span>Checks</span><strong>{issues.length}</strong></div>
        <div><span>Passing</span><strong>{totals.pass}</strong></div>
        <div><span>Failing</span><strong>{totals.fail}</strong></div>
        <div><span>Warnings</span><strong>{totals.warn}</strong></div>
      </div>
    </section>
  );

  const suites: { name: string; area: ModelIssue["area"]; description: string }[] = [
    { name: "Data model", area: "Data", description: "Entity names, duplicate fields, references and choice options." },
    { name: "Screen bindings", area: "Screens", description: "Every data component resolves to an entity and to fields that exist." },
    { name: "Automation reachability", area: "Logic", description: "Conditions compare against values a field can actually hold." },
    { name: "Access model", area: "Access", description: "Role grants, and what a new person inherits." },
  ];

  if (lens === "Suites") {
    return (
      <Stack gap={4}>
        {testOverview}
        <StatRow>
          <Stat prov="posted" label="Checks" value={String(issues.length)} meta="Computed from the model" />
          <Stat prov="posted" label="Failing" value={String(totals.fail)} meta="Would block a release" />
          <Stat prov="posted" label="To review" value={String(totals.warn)} meta="Judgement" />
          <Stat label="Last recorded run" value={lastRun ? context.dateTime(lastRun) : "Never"} unavailable={!lastRun} meta={lastRun ? context.relative(lastRun) : "Run the suites to record one"} />
        </StatRow>
        <Grid>
          {suites.map((suite) => {
            const slice = issueTotals(issues.filter((issue) => issue.area === suite.area));
            return (
              <Card key={suite.name} span={6} title={suite.name} subtitle={suite.description}
                actions={<Pill tone={slice.fail ? "danger" : slice.warn ? "warning" : "success"} dot>{slice.fail ? `${slice.fail} failing` : slice.warn ? `${slice.warn} to review` : "passing"}</Pill>}
                footer={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("Test report", { area: suite.area })}>Open the report</Button>}>
                <Properties rows={[
                  { label: "Checks", value: String(slice.fail + slice.warn + slice.pass) },
                  { label: "Passing", value: String(slice.pass) },
                ]} />
              </Card>
            );
          })}
          <Card span={12} title="What these suites are not" >
            <Notice tone="warning" title="A green model is not a working app">
              These suites read the model: names, references, bindings and grants. They do not run the built app, do not call a server and cannot tell you that a feature behaves correctly. A passing result here means the design is consistent, nothing more.
            </Notice>
          </Card>
        </Grid>
        <Row gap={2}>
          <Button variant="primary" onClick={async () => {
            await context.mutate.patch(record.id, {
              fields: { ...record.fields, lastCheckAt: now.toISOString(), checkFail: totals.fail, checkWarn: totals.warn, checkPass: totals.pass },
            }, { event: `Model checks run: ${totals.fail} failing, ${totals.warn} to review, ${totals.pass} passing` });
            context.toast("Checks recorded", `${issues.length} checks computed. ${totals.fail} failing.`, totals.fail ? "blocked" : "ok");
          }}>Run the suites</Button>
          <Button variant="secondary" onClick={() => {
            downloadCsv(`${context.org.slug}-${record.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-checks.csv`,
              ["area", "level", "check", "detail"],
              issues.map((issue) => [issue.area, issue.level, issue.title, issue.detail]));
            context.toast("Exported", `${issues.length} checks written to CSV.`);
          }}>Export the results</Button>
        </Row>
      </Stack>
    );
  }

  if (lens === "Runs") {
    const runs = events.filter((event) => /checks run|audit|test/i.test(event.message));
    return runs.length === 0
      ? <Empty title="No recorded runs" icon={<TestTube2 size={20} />}>Press Run the suites on the Suites tab and the result is recorded on the project record.</Empty>
      : (
        <DataGrid
          rows={runs}
          rowId={(row) => row.id}
          label="Check runs"
          columns={[
            { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
            { key: "actor", header: "Who", cell: (row) => row.actor },
            { key: "message", header: "Result", cell: (row) => row.message, filterValue: (row) => row.message },
          ]}
        />
      );
  }

  if (lens === "Coverage") {
    const bound = model.screens.flatMap((screen) => screen.components).filter((component) => component.kind !== "text");
    const resolved = bound.filter((component) => model.entities.some((entity) => entity.id === component.entityId));
    const entitiesUsed = new Set(bound.map((component) => component.entityId));
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="posted" label="Entities" value={`${entitiesUsed.size} of ${model.entities.length}`} meta="Used by at least one component" />
          <Stat prov="posted" label="Components bound" value={`${resolved.length} of ${bound.length}`} meta="Resolve to an entity" />
          <Stat prov="posted" label="Entities reading data" value={String(model.entities.filter((entity) => entity.collection).length)} meta="Bound to a workspace collection" />
          <Stat label="Line coverage" value="Unavailable" unavailable meta="No test runner executes the generated code" />
        </StatRow>
        <Card eyebrow="COVERAGE" prov="posted" title="Entities by use" subtitle="An entity nothing reads is usually a leftover">
          <BarChart
            title="Components per entity"
            height={Math.max(180, model.entities.length * 32)}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Components", points: model.entities.map((entity) => ({ label: entity.name, value: bound.filter((component) => component.entityId === entity.id).length })) }]}
            footer="Counted from the screen designer. Line coverage would need a runner, and none exists here."
          />
        </Card>
      </Stack>
    );
  }

  return issues.filter((issue) => issue.level !== "pass").length === 0
    ? <Empty title="No issues" icon={<ShieldCheck size={20} />}>Every check on the model passes.</Empty>
    : (
      <Stack gap={2}>
        {issues.filter((issue) => issue.level !== "pass").map((issue) => (
          <div key={issue.id} className="t6-check" data-state={issue.level}>
            <span className="t6-check-dot" aria-hidden="true" />
            <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
            <Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.area}</Pill>
          </div>
        ))}
      </Stack>
    );
}

/* ================================================================ *
 * ARL-BUILD-009 — Deployments & Environments
 * ================================================================ */

export function DeployScreen({ context, lens }: { context: ScreenContext; lens: "Environments" | "Releases" | "Logs" | "Rollbacks" }) {
  const { record, model } = useAppRecord(context);
  const events = useEvents(record?.id);
  if (!record) return <NoProject />;
  const totals = issueTotals(validateApp(model));
  const releaseOverview = (
    <section className="t6-build-library-overview" aria-label="Build release overview">
      <Row gap={2} wrap>
        <div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / RELEASE MANAGEMENT</span><h2>Review the release, not just its label.</h2><p className="ds-subtle">Track model gates and local release attempts. A production runtime and hosting provider are not connected.</p></div>
        <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/tests`)}>View checks</Button>
      </Row>
      <div className="t6-build-library-metrics" aria-label="Build release status">
        <div><span>Model failures</span><strong>{totals.fail}</strong></div>
        <div><span>Warnings</span><strong>{totals.warn}</strong></div>
        <div><span>Release attempts</span><strong>{model.releases.length}</strong></div>
        <div><span>Connected runtimes</span><strong>0</strong></div>
      </div>
    </section>
  );

  if (lens === "Environments") {
    const environments: { name: Release["environment"]; purpose: string }[] = [
      { name: "preview", purpose: "The designer preview in this browser, against real workspace records." },
      { name: "staging", purpose: "A named snapshot of the model for a reviewer." },
      { name: "production", purpose: "What a runtime would serve. Nothing is connected." },
    ];
    return (
      <Stack gap={4}>
        {releaseOverview}
      <Grid>
        {environments.map((environment) => {
          const last = [...model.releases].filter((release) => release.environment === environment.name).sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
          const blocked = environment.name !== "preview" && totals.fail > 0;
          return (
            <Card key={environment.name} span={4} title={environment.name} subtitle={environment.purpose}
              actions={<Pill tone={environment.name === "production" ? "danger" : environment.name === "staging" ? "warning" : "neutral"} dot>{environment.name}</Pill>}
              footer={<Button size="sm" variant={environment.name === "preview" ? "primary" : "secondary"} onClick={() => {
                if (environment.name === "preview") context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/builder?tab=Preview`);
                else context.openOverlay("Release approval", { environment: environment.name });
              }}>{environment.name === "preview" ? "Open the preview" : "Review a release"}</Button>}>
              <Properties rows={[
                { label: "Last attempt", value: last ? context.dateTime(last.at) : "Never" },
                { label: "Outcome", value: last ? last.state.replace("_", " ") : "None" },
                { label: "Gate", value: blocked ? <Pill tone="danger">{totals.fail} failing checks</Pill> : environment.name === "preview" ? "None" : <Pill tone="success">checks clear</Pill> },
              ]} />
            </Card>
          );
        })}
        <Card span={12} title="The environment label is not decoration">
          <Notice tone="warning" title="Preview and production are never shown the same way">
            The builder toolbar, this page and every release row carry the environment in the same colour, so a staging snapshot cannot be mistaken for production. Production itself is unreachable: no runtime is connected.
          </Notice>
        </Card>
      </Grid>
      </Stack>
    );
  }

  if (lens === "Releases") {
    return (
      <Stack gap={4}>
        <Row gap={2}><Button variant="primary" onClick={() => context.openOverlay("Release approval", { environment: "production" })}>Promote</Button></Row>
        {model.releases.length === 0 ? (
          <Empty title="No release attempt recorded" icon={<Rocket size={20} />}>Promoting records what happened, including when it stopped at the runtime boundary.</Empty>
        ) : (
          <DataGrid
            rows={[...model.releases].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))}
            rowId={(row) => row.id}
            label="Releases"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "environment", header: "Environment", cell: (row) => <Pill tone={row.environment === "production" ? "danger" : row.environment === "staging" ? "warning" : "neutral"} dot>{row.environment}</Pill> },
              { key: "state", header: "Outcome", cell: (row) => <Pill tone={row.state === "built" ? "success" : row.state === "rolled_back" ? "warning" : "danger"}>{row.state.replace("_", " ")}</Pill> },
              { key: "note", header: "Note", cell: (row) => row.note },
              { key: "actor", header: "By", cell: (row) => row.actor },
            ]}
            onOpen={(id) => context.openOverlay("rollback impact", { id })}
          />
        )}
      </Stack>
    );
  }

  if (lens === "Rollbacks") {
    const rolled = model.releases.filter((release) => release.state === "rolled_back");
    return (
      <Stack gap={4}>
        {rolled.length === 0
          ? <Empty title="Nothing has been rolled back" icon={<Rocket size={20} />}>A rollback is recorded here with the release it returned to.</Empty>
          : <Stack gap={2}>{rolled.map((release) => (
            <Row key={release.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <div className="ds-grow"><strong>{context.dateTime(release.at)}</strong><p className="ds-subtle">{release.note}</p></div>
              <Pill tone="warning">{release.environment}</Pill>
            </Row>
          ))}</Stack>}
        <Notice tone="info" title="A rollback changes the record, not a server">
          There is nothing running to roll back. What a rollback does here is restore the model to an earlier revision and say so in the history.
        </Notice>
      </Stack>
    );
  }

  const logs = events.filter((event) => /release|promote|rollback|deploy/i.test(event.message));
  return logs.length === 0
    ? <Empty title="No build logs" icon={<Activity size={20} />}>No build runs here, so the only log is the audit trail of release attempts.</Empty>
    : (
      <DataGrid
        rows={logs}
        rowId={(row) => row.id}
        label="Release log"
        columns={[
          { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
          { key: "actor", header: "Who", cell: (row) => row.actor },
          { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
        ]}
      />
    );
}

export function ReleaseApproval({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  const { now } = useWorkspace();
  const payload = context.overlayPayload as { environment?: Release["environment"] } | undefined;
  const environment = payload?.environment ?? "production";
  const [busy, setBusy] = useState(false);
  if (!record) return <NoProject />;
  const issues = validateApp(model);
  const totals = issueTotals(issues);
  const failing = issues.filter((issue) => issue.level === "fail");
  const paused = Boolean(record.fields.deploysPaused);

  return (
    <Stack gap={4}>
      {paused && <Notice tone="warning" title="Deployments are paused">{`Promotion is refused until they are resumed: ${String(record.fields.pauseReason ?? "")}`}</Notice>}
      <ul className="t6-steps">
        <li className="t6-step" data-state={totals.fail === 0 ? "done" : "blocked"}><span className="t6-step-n">1</span>Model checks · {totals.fail === 0 ? "clear" : `${totals.fail} failing`}</li>
        <li className="t6-step" data-state={model.screens.length ? "done" : "blocked"}><span className="t6-step-n">2</span>{model.screens.length} screens</li>
        <li className="t6-step" data-state="blocked"><span className="t6-step-n">3</span>Runtime · not connected</li>
        <li className="t6-step" data-state="current"><span className="t6-step-n">4</span>Record the attempt</li>
      </ul>
      {failing.length > 0 && (
        <Notice tone="danger" title={`${failing.length} failing ${failing.length === 1 ? "check" : "checks"} block promotion to ${environment}`}>
          <ul style={{ margin: "4px 0 0", paddingInlineStart: 18 }}>{failing.slice(0, 5).map((issue) => <li key={issue.id}>{issue.title}</li>)}</ul>
        </Notice>
      )}
      <Properties rows={[
        { label: "Environment", value: environment },
        { label: "Entities", value: String(model.entities.length) },
        { label: "Screens", value: String(model.screens.length) },
        { label: "Runtime", value: <CapabilityState id="site.publish" /> },
      ]} />
      <BoundaryNotice id="site.publish" action={`Promotion to ${environment}`} />
      <Row gap={2}>
        <Button
          variant="primary"
          busy={busy}
          disabled={failing.length > 0 || paused}
          onClick={async () => {
            setBusy(true);
            try {
              const release: Release = {
                id: `re-${wallMs().toString(36)}`,
                environment,
                at: now.toISOString(),
                state: "blocked",
                note: "Checks passed. Stopped at the runtime boundary: nothing hosts this app.",
                actor: context.actor,
              };
              await saveApp(context, record, { ...model, releases: [...model.releases, release] }, `Promotion to ${environment} recorded as blocked at the runtime boundary`);
              context.toast("Recorded as not promoted", "The attempt is in the release history as blocked, with the reason.", "blocked");
              close();
            } finally {
              setBusy(false);
            }
          }}
        >
          Record the attempt honestly
        </Button>
        <Button variant="secondary" onClick={() => {
          const files = generatedFiles(model);
          downloadFile("types.ts", files[0].content, "text/plain");
          context.toast("Types exported", "src/types.ts downloaded. The rest are on the code screen.");
        }}>Take the generated code instead</Button>
      </Row>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-BUILD-010 — Integrations & Secrets
 * ================================================================ */

export function IntegrationsScreen({ context, lens }: { context: ScreenContext; lens: "Connections" | "Secrets" | "Webhooks" | "Health" }) {
  const { record, model } = useAppRecord(context);
  const connectors = useCollection("connectors");
  if (!record) return <NoProject />;

  if (lens === "Secrets") {
    return (
      <Stack gap={4}>
        <Notice tone="danger" title="No secret is stored in this workspace">
          This browser has no safe place to keep a credential: anything written here would sit in IndexedDB in plain text, readable by anything else on the page. So nothing is stored, nothing is generated, and the fields below are deliberately absent.
        </Notice>
        <Card eyebrow="SECRETS" prov="unknown" title="What a key would need" subtitle="The shape, without the value">
          <div className="t6-matrix-wrap">
            <table className="t6-matrix">
              <caption className="ds-sr-only">Environment keys this app would need</caption>
              <thead><tr><th scope="col">Name</th><th scope="col">Used by</th><th scope="col">State</th></tr></thead>
              <tbody>
                <tr><td><code>DATABASE_URL</code></td><td>The server that would hold the entities</td><td><Pill tone="warning">not set</Pill></td></tr>
                <tr><td><code>MAIL_API_KEY</code></td><td>Any automation step that notifies</td><td><Pill tone="warning">not set</Pill></td></tr>
                <tr><td><code>SESSION_SECRET</code></td><td>Signing sessions once an auth provider exists</td><td><Pill tone="warning">not set</Pill></td></tr>
              </tbody>
            </table>
          </div>
        </Card>
        <Notice tone="warning" title="A secret is never shown to an assistant either">
          If a key existed, it would be referenced by name in logs, diagnoses and generated code, never by value. That rule is why this screen has no reveal control to offer.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Webhooks") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="A webhook needs an address that can receive a request">
          Nothing in this browser can be reached from outside it. A webhook defined here would be a note, so the screen records the intent and says plainly that no delivery can happen.
        </Notice>
        <Card title="Automations that would send one" subtitle={`${model.automations.filter((automation) => automation.steps.some((step) => step.kind === "notify")).length} of ${model.automations.length}`}>
          <Stack gap={2}>
            {model.automations.filter((automation) => automation.steps.some((step) => step.kind === "notify")).map((automation) => (
              <Row key={automation.id} gap={2}><span className="ds-grow">{automation.name}</span><Pill tone="warning">would notify</Pill></Row>
            ))}
            {model.automations.filter((automation) => automation.steps.some((step) => step.kind === "notify")).length === 0 && <span className="ds-subtle">No automation has a notify step.</span>}
          </Stack>
        </Card>
      </Stack>
    );
  }

  if (lens === "Health") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="posted" label="Connected providers" value="0" meta={`${connectors.length} recorded, none connected`} />
          <Stat prov="posted" label="Calls made" value="0" meta="This workspace makes no network calls" />
          <Stat label="Error rate" value="Unavailable" unavailable meta="No calls to measure" />
          <Stat label="Quota" value="Unavailable" unavailable meta="Reported by a provider, not by us" />
        </StatRow>
        <Notice tone="info" title="A zero here is a real zero">
          No call has been attempted, so the count is exactly nought rather than unknown. The rate and the quota are blank, because those would come from a provider's response.
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <section className="t6-build-library-overview" aria-label="Build integration overview">
        <Row gap={2} wrap><div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / INTEGRATIONS</span><h2>Understand every connection boundary.</h2><p className="ds-subtle">Explore workspace connector records and their declared state. No external service is represented as connected without a provider.</p></div></Row>
        <div className="t6-build-library-metrics" aria-label="Integration connection summary">
          <div><span>Recorded connectors</span><strong>{connectors.length}</strong></div>
          <div><span>Connected providers</span><strong>0</strong></div>
          <div><span>API contracts</span><strong>{model.endpoints.length}</strong></div>
          <div><span>Notify workflows</span><strong>{model.automations.filter((automation) => automation.steps.some((step) => step.kind === "notify")).length}</strong></div>
        </div>
      </section>
      {connectors.length === 0 ? <Empty title="No connectors recorded" icon={<KeyRound size={20} />} /> : (
        <DataGrid
          rows={connectors}
          rowId={(row) => row.id}
          label="Connections available to this app"
          columns={[
            { key: "title", header: "Connector", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "provider", header: "Provider", cell: (row) => String(row.fields.provider ?? "—") },
            { key: "state", header: "State", cell: (row) => <Pill tone="warning" dot>{String(row.fields.capability ?? row.status).replace(/_/g, " ")}</Pill> },
            { key: "local", header: "Done locally instead", cell: (row) => row.summary },
          ]}
          onOpen={(id) => context.navigate(`/o/${context.org.slug}/connect/marketplace/${id}`)}
        />
      )}
      <Notice tone="warning" title="Attaching an integration is a workspace decision">
        Connections are managed in the integrations application, not per app project, so one honest state is shown everywhere rather than two that can disagree.
      </Notice>
    </Stack>
  );
}

/* ================================================================ *
 * ARL-BUILD-011 — App Analytics & Monitoring
 * ================================================================ */

export function MonitorScreen({ context, lens }: { context: ScreenContext; lens: "Errors" | "Performance" | "Usage" | "Costs" }) {
  const { record, model } = useAppRecord(context);
  const events = useEvents(record?.id);
  if (!record) return <NoProject />;
  const issues = validateApp(model);
  const totals = issueTotals(issues);

  if (lens === "Errors") {
    return (
      <Stack gap={5}>
        <section className="t6-build-library-overview" aria-label="Build monitoring overview">
          <Row gap={2} wrap><div className="ds-grow" style={{ minWidth: 220 }}><span className="ds-subtle">BUILD / DIAGNOSTICS</span><h2>Separate verified model health from runtime monitoring.</h2><p className="ds-subtle">Review local model findings and project activity. Runtime errors, latency and production usage remain unavailable until a deployed runtime is connected.</p></div><Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/build/projects/${record.id}/tests`)}>Open checks</Button></Row>
          <div className="t6-build-library-metrics" aria-label="Monitoring diagnostic summary">
            <div><span>Model failures</span><strong>{totals.fail}</strong></div>
            <div><span>Warnings</span><strong>{totals.warn}</strong></div>
            <div><span>Project events</span><strong>{events.length}</strong></div>
            <div><span>Connected runtimes</span><strong>0</strong></div>
          </div>
        </section>
        <StatRow>
          <Stat label="Runtime errors" value="Unavailable" unavailable meta="The app does not run anywhere" onClick={() => context.openOverlay("Trace viewer")} />
          <Stat prov="posted" label="Model failures" value={String(totals.fail)} meta="Measured from the design" />
          <Stat prov="posted" label="Warnings" value={String(totals.warn)} meta="Measured from the design" />
          <Stat label="Last check" value={record.fields.lastCheckAt ? context.relative(String(record.fields.lastCheckAt)) : "Never"} unavailable={!record.fields.lastCheckAt} meta="Recorded on the project record" />
        </StatRow>
        <Notice tone="warning" title="There is no runtime to report errors">
          Error monitoring needs something executing. What can be measured is the design, and those failures are listed below with the same seriousness a runtime error would get.
        </Notice>
        {issues.filter((issue) => issue.level === "fail").length === 0 ? (
          <Notice tone="success" title="No failing checks">The model is internally consistent.</Notice>
        ) : (
          <Stack gap={2}>
            {issues.filter((issue) => issue.level === "fail").map((issue) => (
              <div key={issue.id} className="t6-check" data-state="fail">
                <span className="t6-check-dot" aria-hidden="true" />
                <div><strong>{issue.title}</strong><p className="ds-subtle">{issue.detail}</p></div>
                <Pill tone="danger">{issue.area}</Pill>
              </div>
            ))}
          </Stack>
        )}
      </Stack>
    );
  }

  if (lens === "Performance") {
    const generated = generatedFiles(model);
    const bytes = generated.reduce((sum, file) => sum + new TextEncoder().encode(file.content).length, 0);
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat prov="posted" label="Generated code" value={`${(bytes / 1024).toFixed(1)} kB`} meta={`${generated.length} files, measured`} />
          <Stat prov="posted" label="Components" value={String(model.screens.reduce((sum, screen) => sum + screen.components.length, 0))} meta="Across every screen" />
          <Stat label="Response time" value="Unavailable" unavailable meta="Nothing serves a request" />
          <Stat label="Throughput" value="Unavailable" unavailable meta="Nothing serves a request" />
        </StatRow>
        <Card eyebrow="MEASURED" prov="posted" title="Generated output by file" subtitle="Byte counts from generating the files now">
          <BarChart
            title="Generated bytes per file"
            height={200}
            format={(value) => `${Math.round(value / 102.4) / 10} kB`}
            series={[{ name: "Bytes", points: generated.map((file) => ({ label: file.path.replace("src/", ""), value: new TextEncoder().encode(file.content).length })) }]}
          />
        </Card>
      </Stack>
    );
  }

  if (lens === "Usage") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="There are no users to count">
          Usage needs people opening a deployed app. Nothing is deployed. What exists instead is the record of people working on the project, which is below.
        </Notice>
        {events.length === 0 ? <Empty title="No activity recorded" icon={<Activity size={20} />} /> : (
          <DataGrid
            rows={events.slice(0, 50)}
            rowId={(row) => row.id}
            label="Project activity"
            columns={[
              { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at), sortValue: (row) => row.at },
              { key: "actor", header: "Who", cell: (row) => row.actor },
              { key: "type", header: "Type", cell: (row) => <Pill tone="neutral">{row.type}</Pill> },
              { key: "message", header: "Entry", cell: (row) => row.message, filterValue: (row) => row.message },
            ]}
          />
        )}
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat prov="posted" label="Hosting" value="£0.00" meta="Nothing is hosted" />
        <Stat prov="posted" label="Database" value="£0.00" meta="Records live in this browser" />
        <Stat prov="posted" label="Model calls" value="£0.00" meta="No model provider is connected" />
        <Stat label="Forecast" value="Unavailable" unavailable meta="A forecast needs a price and a volume" onClick={() => context.openOverlay("budget panel")} />
      </StatRow>
      <Notice tone="info" title="Nought is accurate, a forecast would not be">
        Every cost above is genuinely nothing, because nothing runs. A projected bill would need both a provider price list and an expected volume, and neither exists here, so the forecast is left blank.
      </Notice>
    </Stack>
  );
}

/* ------------------------------ Shared overlays ------------------------------ */

export function PreviewOverlay({ context }: { context: ScreenContext }) {
  const { record, model } = useAppRecord(context);
  const ui = useBuildUi();
  if (!record) return <NoProject />;
  const screen = model.screens.find((item) => item.id === ui.screenId) ?? model.screens[0];
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Bindings resolved against this workspace">
        Each component below reads the collection its entity names, in {context.org.name}. Anything unbound says so.
      </Notice>
      <ScreenPreview model={model} screen={screen} role={ui.previewRole} />
    </Stack>
  );
}

export function ExpressionEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, model } = useAppRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = model.automations.find((item) => item.id === payload?.id);
  const [name, setName] = useState(existing?.name ?? "");
  const [entityId, setEntityId] = useState(existing?.entityId ?? model.entities[0]?.id ?? "");
  const [trigger, setTrigger] = useState<Automation["trigger"]>(existing?.trigger ?? "record_created");
  const [fieldId, setFieldId] = useState(existing?.condition.fieldId ?? "");
  const [operator, setOperator] = useState<Automation["condition"]["operator"]>(existing?.condition.operator ?? "equals");
  const [value, setValue] = useState(existing?.condition.value ?? "");
  const [stepKind, setStepKind] = useState<Automation["steps"][number]["kind"]>(existing?.steps[0]?.kind ?? "update_field");
  const [detail, setDetail] = useState(existing?.steps[0]?.detail ?? "");
  if (!record) return <NoProject />;
  const entity = model.entities.find((item) => item.id === entityId);
  const field = entity?.fields.find((item) => item.id === fieldId);
  const unreachable = Boolean(field && field.kind === "choice" && value && !field.options.includes(value));

  return (
    <form
      id="expression-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim() || unreachable) return;
        const automation: Automation = {
          id: existing?.id ?? `au-${wallMs().toString(36)}`,
          name: name.trim(),
          trigger,
          entityId,
          condition: { fieldId, operator, value },
          steps: [{ id: existing?.steps[0]?.id ?? "st-1", kind: stepKind, detail }],
          enabled: existing?.enabled ?? true,
        };
        const automations = existing ? model.automations.map((item) => (item.id === existing.id ? automation : item)) : [...model.automations, automation];
        await saveApp(context, record, { ...model, automations }, `Automation ${automation.name} ${existing ? "changed" : "added"}`);
        context.toast("Automation saved", stepKind === "notify" ? "Its notify step records an intention; no mail provider is connected." : `${automation.name} will run on ${trigger.replace("_", " ")}.`);
        close();
      }}
    >
      <Field label="Name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Row gap={2}>
        <Field label="Watches">
          <Select value={entityId} onChange={(event) => { setEntityId(event.target.value); setFieldId(""); }}>
            {model.entities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="When">
          <Select value={trigger} onChange={(event) => setTrigger(event.target.value as Automation["trigger"])}>
            <option value="record_created">a record is created</option>
            <option value="record_updated">a record is updated</option>
            <option value="schedule">on a schedule</option>
            <option value="manual">someone runs it</option>
          </Select>
        </Field>
      </Row>
      <Row gap={2}>
        <Field label="And this field">
          <Select value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
            <option value="">no condition</option>
            {entity?.fields.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
        <Field label="Comparison">
          <Select value={operator} onChange={(event) => setOperator(event.target.value as Automation["condition"]["operator"])}>
            <option value="equals">is</option>
            <option value="greater_than">is more than</option>
            <option value="less_than">is less than</option>
            <option value="changed">changed</option>
          </Select>
        </Field>
        <Field label="Value" error={unreachable ? `${field?.name} can never hold "${value}".` : undefined}>
          {field && field.kind === "choice"
            ? <Select value={value} onChange={(event) => setValue(event.target.value)}><option value="">choose</option>{field.options.map((option) => <option key={option} value={option}>{option}</option>)}</Select>
            : <TextInput value={value} onChange={(event) => setValue(event.target.value)} invalid={unreachable} />}
        </Field>
      </Row>
      <Row gap={2}>
        <Field label="Then">
          <Select value={stepKind} onChange={(event) => setStepKind(event.target.value as Automation["steps"][number]["kind"])}>
            <option value="update_field">update a field</option>
            <option value="create_record">create a record</option>
            <option value="approve">ask for approval</option>
            <option value="notify">notify someone</option>
          </Select>
        </Field>
        <Field label="Detail"><TextInput value={detail} onChange={(event) => setDetail(event.target.value)} placeholder="Set Status to sent" /></Field>
      </Row>
      {stepKind === "notify" && <BoundaryNotice id="email.send" action="The notify step" />}
      {unreachable && <Notice tone="danger" title="This branch can never run">Pick a value the field can hold.</Notice>}
    </form>
  );
}
