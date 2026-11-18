import { useMemo, useState } from "react";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  ArrowDown, ArrowUp, Database, FileText, Globe, Inbox, Layers, Link2, Plus, Shapes,
} from "lucide-react";
import {
  Button, Card, Checkbox, DataGrid, Empty, Field, Grid, Notice, Pill, Properties,
  Row, Select, Stack, Stat, StatRow, TextArea, TextInput,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useEvents, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness, wallMs } from "@/platform/clock";
import { BoundaryNotice, SortableRow, ReorderArea, move, plural, slugify } from "@/applications/t6kit/kit";
import {
  BLOCK_LABELS, auditSite, exportBytes, issueCounts, liveState, makeBlock, makePage, pageHtml,
  readSite, type CmsCollection, type CmsEntry, type CmsField, type NavLink, type SiteModel,
} from "./model";
import { PageView } from "./render";
import { ThemeEditor } from "./builder";
import { saveSite, useWebUi } from "./state";
import { findLink, moveChild, placeLink, removeLink, targetProblem } from "./nav";
import { redirectId } from "./pages";
import { SiteLibrary } from "./siteLibrary";

/* ---------------------------------------------------------------- *
 * Shared site resolution
 * ---------------------------------------------------------------- */

export function useSiteRecord(context: ScreenContext) {
  const sites = useCollection("sites");
  const routed = useRecord(context.params.id);
  // A detail URL never silently substitutes another site's content.
  const record = context.params.id
    ? routed?.collection === "sites" && routed.organizationId === context.org.id
      ? routed : sites.find(site => site.id === context.params.id)
    : sites.find(site => site.status !== "archived") ?? sites[0];
  const forms = useCollection("forms");
  const site = useMemo(() => readSite(record), [record]);
  const formNames = useMemo(() => Object.fromEntries(forms.map((form) => [form.id, form.title])), [forms]);
  return { sites, record, site, forms, formNames };
}

export function NoSite() {
  return <Empty title="No site in this workspace" icon={<Globe size={20} />}>Create one from the website directory and it will open here.</Empty>;
}

export function SiteStatusStrip({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return null;
  const state = liveState(record, site);
  const primary = site.domains.find((domain) => domain.primary) ?? site.domains[0];
  return (
    <>
      <strong>{record.title}</strong>
      <span aria-hidden="true">·</span>
      <span className="ds-num">{plural(site.pages.length, "page")}</span>
      <span aria-hidden="true">·</span>
      <Pill tone={state.tone === "neutral" ? "neutral" : state.tone}>{state.label}</Pill>
      <span aria-hidden="true">·</span>
      <span>{primary ? `${primary.host}${primary.verified ? "" : " (unverified)"}` : "No domain attached"}</span>
      <span className="ds-grow" />
      <span>{(exportBytes(site) / 1024).toFixed(1)} kB of HTML measured</span>
    </>
  );
}

/* ================================================================ *
 * ARL-WEB-001 — Website Directory
 * ================================================================ */

export function SiteDirectory({ context, scope }: { context: ScreenContext; scope: "All" | "Draft" | "Published" | "Archived" }) {
  return <SiteLibrary context={context} scope={scope} />;
}

/* ================================================================ *
 * ARL-WEB-002 — Site Dashboard
 * ================================================================ */

export function SiteDashboard({ context, lens }: { context: ScreenContext; lens: "Overview" | "Pages" | "Content" | "Analytics" | "Settings" }) {
  const { record, site, formNames } = useSiteRecord(context);
  const events = useEvents(record?.id);
  const submissions = useCollection("submissions");
  const { now } = useWorkspace();
  const ui = useWebUi();
  if (!record) return <NoSite />;

  const issues = auditSite(site, formNames);
  const counts = issueCounts(issues);
  const state = liveState(record, site);
  const linkedForms = site.pages.flatMap((page) => page.blocks).filter((block) => block.type === "form").map((block) => block.props.formId).filter(Boolean);
  const siteSubmissions = submissions.filter((row) => linkedForms.includes(String(row.parentId ?? "")));
  const lastDeploy = [...site.deployments].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];

  if (lens === "Overview") {
    return (
      <Stack gap={5}>
        <section className="web-site-workspace" aria-label="Website working area">
          <div className="web-site-workspace-head">
            <div>
              <span className="web-library-eyebrow">WEBSITES / SITE WORKSPACE</span>
              <h2>{record.title}</h2>
              <p>Continue editing, review quality and prepare a release without leaving this site.</p>
            </div>
            <div className="web-site-workspace-actions">
              <Button size="sm" variant="primary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/builder`)}>Edit website</Button>
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/quality`)}>Quality checks</Button>
            </div>
          </div>
          <nav className="web-site-workflow" aria-label="Site work areas">
            {([
              ["Pages", "Edit layout and content", "builder"],
              ["Content", "Collections and entries", "cms"],
              ["Navigation", "Menus and redirects", "navigation"],
              ["Publishing", "Domains and exports", "deploy"],
            ] as const).map(([label, detail, route]) => (
              <button type="button" key={route}
                onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/${route}`)}>
                <strong>{label}</strong><span>{detail}</span>
              </button>
            ))}
          </nav>
        </section>
        <StatRow>
          <Stat prov="posted" label="Pages" value={String(site.pages.length)} meta={`${site.pages.reduce((sum, page) => sum + page.blocks.length, 0)} blocks`} />
          <Stat prov="posted" label="Export size" value={`${(exportBytes(site) / 1024).toFixed(1)} kB`} meta="Measured by generating every page" />
          <Stat prov="posted" label="Quality issues" value={String(counts.fail + counts.warn)} meta={`${counts.fail} failing · ${counts.warn} to review`} onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/quality`)} />
          <Stat label="Visits" value="Unavailable" unavailable meta="No analytics source connected" />
        </StatRow>
        <Grid>
          <Card span={7} eyebrow="PUBLICATION" prov="posted" title="Publication" subtitle={state.detail}
            footer={<>
              <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Deploy inspector")}>Deploy inspector</Button>
              <Button size="sm" variant="ghost" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/deploy`)}>Domains and publishing</Button>
            </>}>
            <Properties rows={[
              { label: "State", value: <Pill tone={state.tone === "neutral" ? "neutral" : state.tone} dot>{state.label}</Pill> },
              { label: "Last attempt", value: lastDeploy ? `${context.dateTime(lastDeploy.at)} · ${lastDeploy.environment}` : "Never" },
              { label: "Domains", value: site.domains.length ? site.domains.map((domain) => domain.host).join(", ") : "None attached" },
              { label: "Health check", value: <Pill tone="warning">Cannot run from a browser</Pill> },
            ]} />
            <BoundaryNotice id="site.publish" action="Publishing" />
          </Card>
          <Card span={5} eyebrow="QUALITY" prov="posted" title="Health" subtitle={`${issues.length} checks computed from the model`}>
            <Stack gap={2}>
              {(["SEO", "Accessibility", "Performance", "Links"] as const).map((area) => {
                const slice = issueCounts(issues.filter((issue) => issue.area === area));
                return (
                  <Row key={area} gap={2}>
                    <span className="ds-grow">{area}</span>
                    {slice.fail > 0 && <Pill tone="danger">{slice.fail} failing</Pill>}
                    {slice.warn > 0 && <Pill tone="warning">{slice.warn} to review</Pill>}
                    {slice.fail === 0 && slice.warn === 0 && <Pill tone="success">Clear</Pill>}
                  </Row>
                );
              })}
            </Stack>
          </Card>
          <Card span={7} eyebrow="SUBMISSIONS" prov="posted" title="Form submissions reaching this site" subtitle={`${siteSubmissions.length} records in ${context.org.shortName}`}>
            {siteSubmissions.length === 0
              ? <Empty title="No submissions yet" icon={<Inbox size={20} />}>A form block bound to a form writes a record here when someone submits it.</Empty>
              : <Stack gap={2}>{siteSubmissions.slice(0, 5).map((row) => (
                <Row key={row.id} gap={2}>
                  <span className="ds-grow ds-truncate">{row.title}</span>
                  <span className="ds-subtle">{context.relative(row.at ?? row.createdAt)}</span>
                </Row>
              ))}</Stack>}
          </Card>
          <Card span={5} eyebrow="ACTIVITY" prov="posted" title="Recent activity" subtitle="Audit events for this record">
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
        </Grid>
      </Stack>
    );
  }

  if (lens === "Pages") {
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => context.openOverlay("site settings", { tab: "page" })}>Add page</Button>
          <Button variant="secondary" onClick={() => context.openOverlay("Manage pages")}>Manage pages</Button>
          <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/builder`)}>Open the builder</Button>
        </Row>
        <DataGrid
          rows={site.pages}
          rowId={(row) => row.id}
          label="Pages"
          columns={[
            { key: "name", header: "Page", primary: true, cell: (row) => row.name, sortValue: (row) => row.name, filterValue: (row) => `${row.name} ${row.path}` },
            { key: "path", header: "Address", cell: (row) => <code>{row.path}</code> },
            { key: "blocks", header: "Blocks", align: "end", cell: (row) => String(row.blocks.length), sortValue: (row) => row.blocks.length },
            { key: "bytes", header: "HTML", align: "end", cell: (row) => `${(new TextEncoder().encode(pageHtml(site, row)).length / 1024).toFixed(1)} kB` },
            { key: "seo", header: "Description", cell: (row) => row.seo.description ? <Pill tone="success">Set</Pill> : <Pill tone="warning">Missing</Pill> },
            { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "published" ? "info" : "neutral"}>{row.status}</Pill> },
          ]}
          onOpen={(id) => { ui.setPage(id); context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/builder`); }}
        />
      </Stack>
    );
  }

  if (lens === "Content") {
    return (
      <Grid>
        <Card span={6} title="Content collections" subtitle={`${site.cms.collections.length} defined`}
          footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/cms`)}>Open the CMS editor</Button>}>
          {site.cms.collections.length === 0
            ? <Empty title="No collections" icon={<Database size={20} />}>A collection gives repeated content a schema instead of duplicated blocks.</Empty>
            : <Stack gap={2}>{site.cms.collections.map((collection) => (
              <Row key={collection.id} gap={2}>
                <span className="ds-grow">{collection.name}</span>
                <Pill tone="neutral">{collection.fields.length} fields</Pill>
                <Pill tone="info">{site.cms.entries.filter((entry) => entry.collectionId === collection.id).length} entries</Pill>
              </Row>
            ))}</Stack>}
        </Card>
        <Card span={6} title="Forms on this site" subtitle={`${site.forms.length} defined`}
          footer={<Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/forms`)}>Open forms and integrations</Button>}>
          {site.forms.length === 0
            ? <Empty title="No site forms" icon={<Inbox size={20} />}>A form block can bind to a form record in this workspace.</Empty>
            : <Stack gap={2}>{site.forms.map((form) => (
              <Row key={form.id} gap={2}><span className="ds-grow">{form.name}</span><Pill tone={form.formRecordId ? "success" : "warning"}>{form.formRecordId ? "Bound" : "Unbound"}</Pill></Row>
            ))}</Stack>}
        </Card>
      </Grid>
    );
  }

  if (lens === "Analytics") {
    return (
      <Grid>
        <Card span={6} eyebrow="MEASURED" prov="posted" title="What is measured" subtitle="Only what this browser can observe">
          <Properties rows={[
            { label: "Form submissions", value: `${siteSubmissions.length} records` },
            { label: "Builder edits", value: `${events.length} audit events` },
            { label: "Pages", value: String(site.pages.length) },
            { label: "Export size", value: `${(exportBytes(site) / 1024).toFixed(1)} kB` },
          ]} />
        </Card>
        <Card span={6} eyebrow="NOT MEASURED" prov="unknown" title="What is not measured" subtitle="Left blank rather than filled in">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Visits", value: <Pill tone="warning">Unavailable</Pill> },
              { label: "Sources", value: <Pill tone="warning">Unavailable</Pill> },
              { label: "Bounce rate", value: <Pill tone="warning">Unavailable</Pill> },
              { label: "Consent", value: <Pill tone="warning">{site.analytics.consent.replace("_", " ")}</Pill> },
            ]} />
            <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/web/sites/${record.id}/analytics`)}>Open web analytics</Button>
          </Stack>
        </Card>
      </Grid>
    );
  }

  const age = freshness(record.updatedAt, now, 14);
  return (
    <Grid>
      <Card span={6} eyebrow="RECORD" prov="human" title="Site record" subtitle={`Revision ${record.revision}`}>
        <Properties rows={[
          { label: "Title", value: record.title },
          { label: "Summary", value: record.summary || "Not recorded" },
          { label: "Owner", value: record.ownerName },
          { label: "Updated", value: `${context.dateTime(record.updatedAt)} · ${age.known ? `${age.days} days ago` : "unknown"}` },
          { label: "Organisation", value: context.org.name },
        ]} />
      </Card>
      <Card span={6} title="Site settings" subtitle="Applied to every page and the export"
        footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("site settings")}>Edit settings</Button>}>
        <Properties rows={[
          { label: "Site title", value: site.seo.siteTitle },
          { label: "Description", value: site.seo.description || "Not set" },
          { label: "Robots", value: <Pill tone={site.seo.robots === "index" ? "success" : "warning"}>{site.seo.robots}</Pill> },
          { label: "Sitemap", value: site.seo.sitemap ? "Generated on export" : "Not generated" },
          { label: "Analytics consent", value: <Pill tone="warning">{site.analytics.consent.replace("_", " ")}</Pill> },
        ]} />
      </Card>
      <Card span={12} title="Preview" subtitle="The home page as the export renders it">
        <div className="t6-device"><div className="t6-device-frame" style={{ width: "100%", maxWidth: 1040 }}>
          <PageView site={site} pageId={site.pages[0].id} width={1040} formNames={formNames} />
        </div></div>
      </Card>
    </Grid>
  );
}

/* ================================================================ *
 * ARL-WEB-004 — Component Library
 * ================================================================ */

export function ComponentLibrary({ context, lens }: { context: ScreenContext; lens: "Local" | "Shared" | "Variants" | "Usage" }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const rows = lens === "Shared" ? site.components.filter((item) => item.shared) : lens === "Local" ? site.components.filter((item) => !item.shared) : site.components;

  if (lens === "Usage") {
    const usage = site.components.map((component) => ({
      component,
      pages: site.pages.filter((page) => page.blocks.some((block) => component.blocks.some((inner) => inner.type === block.type && inner.props.title === block.props.title))),
    }));
    return usage.length === 0
      ? <Empty title="No components to trace" icon={<Shapes size={20} />}>Extract a section from a page first, then this tab shows every page that matches it.</Empty>
      : (
        <DataGrid
          rows={usage}
          rowId={(row) => row.component.id}
          label="Component usage"
          columns={[
            { key: "name", header: "Component", primary: true, cell: (row) => row.component.name, filterValue: (row) => row.component.name },
            { key: "blocks", header: "Blocks", align: "end", cell: (row) => String(row.component.blocks.length) },
            { key: "pages", header: "Matched on", cell: (row) => row.pages.length ? row.pages.map((page) => page.name).join(", ") : <span className="ds-subtle">No page matches it now</span> },
            { key: "shared", header: "Scope", cell: (row) => <Pill tone={row.component.shared ? "accent" : "neutral"}>{row.component.shared ? "Shared" : "Local"}</Pill> },
          ]}
          summary={<span>Matching compares block type and heading, so a renamed heading detaches the match. That is shown rather than guessed.</span>}
        />
      );
  }

  if (lens === "Variants") {
    return (
      <Grid>
        {rows.length === 0 && <Empty title="No variants recorded" icon={<Layers size={20} />}>A variant is a named alternative of a component, for example a hero with the image on the right.</Empty>}
        {rows.map((component) => (
          <Card key={component.id} span={6} title={component.name} subtitle={`${component.variants.length} variants`}
            footer={<Button size="sm" variant="ghost" onClick={() => context.openOverlay("Component property", { id: component.id })}>Properties</Button>}>
            <Stack gap={2}>
              {component.variants.length === 0 && <span className="ds-subtle">Only the base arrangement exists.</span>}
              {component.variants.map((variant) => <Row key={variant} gap={2}><span className="ds-grow">{variant}</span><Pill tone="neutral">variant</Pill></Row>)}
            </Stack>
          </Card>
        ))}
      </Grid>
    );
  }

  return (
    <Grid>
      {rows.length === 0 && (
        <Empty title={lens === "Shared" ? "Nothing is shared yet" : "No local components"} icon={<Shapes size={20} />}
          action={<Button variant="primary" onClick={() => context.openOverlay("Component property")}>Extract a section</Button>}>
          Extract repeated blocks into a component so one edit reaches every page that uses it.
        </Empty>
      )}
      {rows.map((component) => (
        <Card key={component.id} span={4} title={component.name}
          subtitle={component.blocks.map((block) => BLOCK_LABELS[block.type]).join(" · ")}
          actions={<Pill tone={component.shared ? "accent" : "neutral"}>{component.shared ? "Shared" : "Local"}</Pill>}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Component property", { id: component.id })}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("breaking change", { id: component.id })}>Replace everywhere</Button>
          </>}>
          <Properties rows={[
            { label: "Blocks", value: String(component.blocks.length) },
            { label: "Used on", value: component.usedOn.length ? component.usedOn.join(", ") : "Not recorded" },
          ]} />
        </Card>
      ))}
    </Grid>
  );
}

/* ================================================================ *
 * ARL-WEB-005 — CMS Editor
 * ================================================================ */

export function CmsEditor({ context, lens }: { context: ScreenContext; lens: "Collections" | "Entries" | "Relations" | "Import" }) {
  const { record, site } = useSiteRecord(context);
  const [collectionId, setCollectionId] = useState("");
  const [csv, setCsv] = useState("");
  if (!record) return <NoSite />;
  const collections = site.cms.collections;
  const active = collections.find((item) => item.id === collectionId) ?? collections[0];

  async function write(next: SiteModel["cms"], label: string) {
    await saveSite(context, record!, { ...site, cms: next }, label);
  }

  if (lens === "Collections") {
    return (
      <Stack gap={4}>
        <Row gap={2}><Button variant="primary" icon={<Plus size={15} />} onClick={() => context.openOverlay("Schema editor")}>New collection</Button></Row>
        {collections.length === 0 ? (
          <Empty title="No collections" icon={<Database size={20} />}>A collection is a named shape — fields with types — that entries must satisfy.</Empty>
        ) : (
          <Grid>
            {collections.map((collection) => (
              <Card key={collection.id} span={6} title={collection.name} subtitle={`/${collection.slug}`}
                actions={<Pill tone="neutral">{site.cms.entries.filter((entry) => entry.collectionId === collection.id).length} entries</Pill>}
                footer={<>
                  <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Schema editor", { id: collection.id })}>Edit schema</Button>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("migration preview", { id: collection.id })}>Migration check</Button>
                </>}>
                <Stack gap={1}>
                  {collection.fields.map((field) => (
                    <Row key={field.id} gap={2}>
                      <span className="ds-grow">{field.name}</span>
                      <code className="ds-subtle">{field.type}{field.type === "reference" && field.refCollection ? ` → ${field.refCollection}` : ""}</code>
                      {field.required && <Pill tone="warning">required</Pill>}
                    </Row>
                  ))}
                  {collection.fields.length === 0 && <span className="ds-subtle">No fields yet.</span>}
                </Stack>
              </Card>
            ))}
          </Grid>
        )}
      </Stack>
    );
  }

  if (lens === "Entries") {
    if (!active) return <Empty title="Define a collection first" icon={<Database size={20} />} />;
    const entries = site.cms.entries.filter((entry) => entry.collectionId === active.id);
    return (
      <Stack gap={4}>
        <Row gap={2} wrap>
          <Field label="Collection">
            <Select value={active.id} onChange={(event) => setCollectionId(event.target.value)}>
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </Select>
          </Field>
          <Button variant="primary" onClick={() => context.openOverlay("entry detail", { collectionId: active.id })}>New entry</Button>
        </Row>
        {entries.length === 0 ? (
          <Empty title={`No entries in ${active.name}`} icon={<FileText size={20} />} />
        ) : (
          <DataGrid
            rows={entries}
            rowId={(row) => row.id}
            label={`${active.name} entries`}
            columns={[
              { key: "title", header: "Entry", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => row.title },
              ...active.fields.slice(0, 3).map((field) => ({
                key: field.id,
                header: field.name,
                cell: (row: CmsEntry) => row.values[field.id] || <span className="ds-subtle">Empty</span>,
              })),
              { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "published" ? "success" : "neutral"}>{row.status}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("entry detail", { id, collectionId: active.id })}
            bulkActions={[
              {
                label: "Publish selected",
                onRun: (selected) => void write({
                  ...site.cms,
                  entries: site.cms.entries.map((entry) => (selected.some((row) => row.id === entry.id) ? { ...entry, status: "published" as const } : entry)),
                }, `${selected.length} ${active.name} entries published`),
              },
              {
                label: "Return to draft",
                onRun: (selected) => void write({
                  ...site.cms,
                  entries: site.cms.entries.map((entry) => (selected.some((row) => row.id === entry.id) ? { ...entry, status: "draft" as const } : entry)),
                }, `${selected.length} ${active.name} entries returned to draft`),
              },
            ]}
          />
        )}
      </Stack>
    );
  }

  if (lens === "Relations") {
    const references = collections.flatMap((collection) => collection.fields.filter((field) => field.type === "reference").map((field) => ({ collection, field })));
    return references.length === 0
      ? <Empty title="No references between collections" icon={<Link2 size={20} />}>Add a reference field to a collection and the dependency appears here.</Empty>
      : (
        <Stack gap={4}>
          <DataGrid
            rows={references}
            rowId={(row) => `${row.collection.id}-${row.field.id}`}
            label="References"
            columns={[
              { key: "from", header: "From", primary: true, cell: (row) => `${row.collection.name}.${row.field.name}` },
              { key: "to", header: "To", cell: (row) => row.field.refCollection || <Pill tone="danger">Unresolved</Pill> },
              {
                key: "valid", header: "Resolves", cell: (row) => collections.some((collection) => collection.slug === row.field.refCollection || collection.name === row.field.refCollection)
                  ? <Pill tone="success">Yes</Pill>
                  : <Pill tone="danger">No collection with that name</Pill>,
              },
              { key: "entries", header: "Entries pointing", align: "end", cell: (row) => String(site.cms.entries.filter((entry) => entry.collectionId === row.collection.id && entry.values[row.field.id]).length) },
            ]}
          />
          <Notice tone="info" title="A reference is checked, not assumed">Each row is resolved against the collections actually defined on this site.</Notice>
        </Stack>
      );
  }

  const parsed = parseCsv(csv);
  return (
    <Grid>
      <Card span={7} title="Import entries from CSV" subtitle="Parsed in this browser; nothing is uploaded">
        <Stack gap={3}>
          <Field label="Collection">
            <Select value={active?.id ?? ""} onChange={(event) => setCollectionId(event.target.value)}>
              {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
            </Select>
          </Field>
          <Field label="Paste CSV" hint="First row is the header. Column names are matched to field names.">
            <TextArea rows={7} value={csv} onChange={(event) => setCsv(event.target.value)} placeholder={"title,summary\nBrass pendant,Hand finished in the workshop"} />
          </Field>
          <Button
            variant="primary"
            disabled={!active || parsed.rows.length === 0}
            onClick={async () => {
              if (!active) return;
              const created: CmsEntry[] = parsed.rows.map((row, index) => ({
                id: `imp-${wallMs().toString(36)}-${index}`,
                collectionId: active.id,
                title: row[parsed.header.indexOf("title")] ?? row[0] ?? `Imported ${index + 1}`,
                status: "draft",
                values: Object.fromEntries(active.fields.map((field) => {
                  const column = parsed.header.findIndex((name) => name.toLowerCase() === field.name.toLowerCase());
                  return [field.id, column >= 0 ? row[column] ?? "" : ""];
                })),
              }));
              await write({ ...site.cms, entries: [...site.cms.entries, ...created] }, `${created.length} entries imported into ${active.name}`);
              context.toast("Entries imported", `${created.length} draft entries were added to ${active.name}.`);
              setCsv("");
            }}
          >
            Import {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}
          </Button>
        </Stack>
      </Card>
      <Card span={5} title="What the parser found" subtitle={parsed.rows.length ? `${parsed.header.length} columns · ${parsed.rows.length} rows` : "Nothing yet"}>
        {parsed.header.length === 0 ? (
          <Empty title="Paste a CSV to see the mapping" />
        ) : (
          <Stack gap={2}>
            {active?.fields.map((field) => {
              const column = parsed.header.findIndex((name) => name.toLowerCase() === field.name.toLowerCase());
              return (
                <Row key={field.id} gap={2}>
                  <span className="ds-grow">{field.name}</span>
                  {column >= 0 ? <Pill tone="success">column {column + 1}</Pill> : <Pill tone="warning">no column</Pill>}
                </Row>
              );
            })}
            <Notice tone="warning" title="Imported entries arrive as drafts">Publishing is a separate decision so an import cannot change a published page by accident.</Notice>
          </Stack>
        )}
      </Card>
    </Grid>
  );
}

export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { header: [], rows: [] };
  const split = (line: string) => line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, ""));
  return { header: split(lines[0]), rows: lines.slice(1).map(split) };
}

/* ================================================================ *
 * ARL-WEB-006 — Site Navigation
 * ================================================================ */

export function SiteNavigation({ context, lens }: { context: ScreenContext; lens: "Header" | "Footer" | "Mobile" | "Redirects" }) {
  const { record, site, formNames } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const which = lens === "Footer" ? "footer" : "header";
  const links = which === "footer" ? site.nav.footer : site.nav.header;

  async function writeNav(next: SiteModel["nav"], label: string) {
    await saveSite(context, record!, { ...site, nav: next }, label);
  }

  function setLinks(nextLinks: NavLink[], label: string) {
    void writeNav({ ...site.nav, [which]: nextLinks }, label);
  }

  if (lens === "Redirects") {
    return (
      <Stack gap={4}>
        <Row gap={2}><Button variant="primary" onClick={() => context.openOverlay("redirect rules")}>Add a redirect</Button></Row>
        {site.nav.redirects.length === 0 ? (
          <Empty title="No redirects" icon={<Link2 size={20} />}>When a page address changes, a redirect keeps the old address working.</Empty>
        ) : (
          <DataGrid
            rows={site.nav.redirects}
            rowId={(row) => row.id}
            label="Redirects"
            columns={[
              { key: "from", header: "From", primary: true, cell: (row) => <code>{row.from}</code>, filterValue: (row) => row.from },
              { key: "to", header: "To", cell: (row) => <code>{row.to}</code> },
              { key: "code", header: "Code", cell: (row) => <Pill tone={row.code === 301 ? "neutral" : "info"}>{row.code}</Pill> },
              {
                key: "valid", header: "Target", cell: (row) => site.pages.some((page) => page.path === row.to)
                  ? <Pill tone="success">Resolves</Pill>
                  : <Pill tone="danger">No page</Pill>,
              },
            ]}
            bulkActions={[{
              label: "Delete", tone: "danger",
              onRun: (selected) => void writeNav({ ...site.nav, redirects: site.nav.redirects.filter((item) => !selected.some((row) => row.id === item.id)) }, `${selected.length} redirects removed`),
            }]}
          />
        )}
      </Stack>
    );
  }

  if (lens === "Mobile") {
    return (
      <Grid>
        <Card span={5} title="Mobile menu" subtitle="The same links, stacked under 640px">
          <Stack gap={3}>
            <Properties rows={[
              { label: "Links", value: String(site.nav.header.length) },
              { label: "Nested links", value: String(site.nav.header.reduce((sum, link) => sum + link.children.length, 0)) },
              { label: "Collapse at", value: "640px" },
            ]} />
            <Notice tone="info" title="One menu, two layouts">The mobile menu is the header menu rendered in a column. There is no second list to keep in step.</Notice>
          </Stack>
        </Card>
        <Card span={7} title="Rendered at 390px" subtitle="The exported markup in a real document">
          <div className="t6-device"><div className="t6-device-frame"><iframe className="t6-frame" title="Mobile menu preview" srcDoc={pageHtml(site, site.pages[0])} style={{ width: 390, height: 420 }} /></div></div>
        </Card>
      </Grid>
    );
  }

  return (
    <Grid>
      <Card span={7} eyebrow="NAVIGATION" prov="human" title={`${lens} menu`} subtitle={`${links.length} links · drag the grip or use the move buttons`}
        footer={<>
          <Button size="sm" variant="primary" onClick={() => context.openOverlay("Link picker", { which })}>Add a route</Button>
          <Button size="sm" variant="ghost" onClick={() => context.openOverlay("broken link scan")}>Scan for broken links</Button>
        </>}>
        {links.length === 0 ? (
          <Empty title={`No ${lens.toLowerCase()} links`} icon={<Link2 size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Link picker", { which })}>Add a route</Button>} />
        ) : (
          <ReorderArea
            label={`${lens} menu order`}
            ids={links.map((link) => link.id)}
            onDragEnd={(event: DragEndEvent) => {
              const from = links.findIndex((link) => link.id === String(event.active.id));
              const to = links.findIndex((link) => link.id === String(event.over?.id ?? ""));
              if (from < 0 || to < 0 || from === to) return;
              setLinks(move(links, from, to), `${lens} menu reordered`);
            }}
          >
            {links.map((link, index) => (
              <SortableRow
                key={link.id}
                id={link.id}
                name={link.label}
                index={index}
                count={links.length}
                onMove={(from, to) => setLinks(move(links, from, to), `${lens} menu reordered`)}
              >
                {({ handle }) => (
                  <div className="web-nav-item">
                    <Row gap={2} style={{ padding: "var(--space-2) var(--space-3)", alignItems: "center" }}>
                      {handle}
                      <div className="ds-grow">
                        <strong>{link.label}</strong>
                        <div className="ds-subtle"><code>{link.target}</code> · {link.kind}{link.children.length ? ` · submenu of ${link.children.length}` : ""}</div>
                      </div>
                      {targetProblem(site, link.kind, link.target) && <Pill tone="danger">{link.kind === "page" ? "No page" : "Invalid target"}</Pill>}
                      {which === "header" && <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Link picker", { which, parentId: link.id })}>Add sub-link</Button>}
                      <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Link picker", { which, id: link.id })}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setLinks(removeLink(links, link.id), `Removed ${link.label}${link.children.length ? ` and its ${link.children.length} sub-links` : ""} from the ${lens.toLowerCase()} menu`)}>Remove</Button>
                    </Row>
                    {link.children.length > 0 && (
                      <ul className="web-nav-children" aria-label={`Submenu of ${link.label}`}>
                        {link.children.map((child, childIndex) => (
                          <li key={child.id}>
                            <div className="ds-grow">
                              <span>{child.label}</span>
                              <div className="ds-subtle"><code>{child.target}</code> · {child.kind}</div>
                            </div>
                            {targetProblem(site, child.kind, child.target) && <Pill tone="danger">{child.kind === "page" ? "No page" : "Invalid target"}</Pill>}
                            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${child.label} up`} disabled={childIndex === 0} icon={<ArrowUp size={14} />}
                              onClick={() => setLinks(moveChild(links, link.id, child.id, -1), `${child.label} moved up in the ${link.label} submenu`)} />
                            <Button size="sm" variant="ghost" iconOnly aria-label={`Move ${child.label} down`} disabled={childIndex === link.children.length - 1} icon={<ArrowDown size={14} />}
                              onClick={() => setLinks(moveChild(links, link.id, child.id, 1), `${child.label} moved down in the ${link.label} submenu`)} />
                            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Link picker", { which, id: child.id })}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => setLinks(removeLink(links, child.id), `Removed ${child.label} from the ${link.label} submenu`)}>Remove</Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </SortableRow>
            ))}
          </ReorderArea>
        )}
      </Card>
      <Card span={5} eyebrow="STRUCTURE" prov="posted" title="Page structure" subtitle={`${site.pages.length} pages`}>
        <Stack gap={2}>
          {site.pages.map((page) => {
            const incoming = [...site.nav.header, ...site.nav.footer].filter((link) => link.target === page.path).length
              + site.pages.flatMap((item) => item.blocks).filter((block) => block.props.ctaTarget === page.path).length;
            return (
              <Row key={page.id} gap={2}>
                <span className="ds-grow"><strong>{page.name}</strong> <code className="ds-subtle">{page.path}</code></span>
                <Pill tone={incoming === 0 ? "warning" : "neutral"}>{incoming} inbound</Pill>
              </Row>
            );
          })}
        </Stack>
        <Notice tone="warning" title="Removing a page is not only a page">
          A page with inbound links leaves those links pointing at nothing, and any indexed address returns an error. The count above is what would break.
        </Notice>
      </Card>
      <Card span={12} title="Preview" subtitle="Menu and first page as exported">
        <div className="t6-device"><div className="t6-device-frame" style={{ width: "100%" }}>
          <PageView site={site} pageId={site.pages[0].id} width={960} formNames={formNames} />
        </div></div>
      </Card>
    </Grid>
  );
}

/* ================================================================ *
 * ARL-WEB-007 — Forms & Integrations
 * ================================================================ */

export function SiteForms({ context, lens }: { context: ScreenContext; lens: "Forms" | "Fields" | "Submissions" | "Routing" }) {
  const { record, site, forms } = useSiteRecord(context);
  const submissions = useCollection("submissions");
  const [selectedFormId, setSelectedFormId] = useState("");
  if (!record) return <NoSite />;
  const siteForms = site.forms;
  const active = siteForms.find((form) => form.id === selectedFormId) ?? siteForms[0];

  async function writeForms(next: SiteModel["forms"], label: string) {
    await saveSite(context, record!, { ...site, forms: next }, label);
  }

  if (lens === "Forms") {
    return (
      <Stack gap={4}>
        <Row gap={2}>
          <Button variant="primary" icon={<Plus size={15} />} onClick={() => void writeForms([...siteForms, {
            id: `sf-${wallMs().toString(36)}`, name: "New site form", formRecordId: forms[0]?.id ?? "",
            fields: [{ id: "n", label: "Name", type: "text", required: true }, { id: "e", label: "Email", type: "email", required: true }],
            consent: "Keep my enquiry on file so the studio can reply.", honeypot: true, route: "record", webhook: "",
          }], "Site form added")}>Add a form</Button>
        </Row>
        {siteForms.length === 0 ? (
          <Empty title="No forms on this site" icon={<Inbox size={20} />}>A site form collects enquiries into a record in this workspace.</Empty>
        ) : (
          <Grid>
            {siteForms.map((form) => {
              const bound = forms.find((item) => item.id === form.formRecordId);
              const count = submissions.filter((row) => row.parentId === form.formRecordId).length;
              return (
                <Card key={form.id} span={6} title={form.name} subtitle={`${form.fields.length} fields`}
                  actions={<Pill tone={bound ? "success" : "warning"}>{bound ? "Bound" : "Not bound"}</Pill>}
                  footer={<>
                    <Button size="sm" variant="secondary" onClick={() => { setSelectedFormId(form.id); context.setTab("Fields"); }}>Edit fields</Button>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("consent inspector", { id: form.id })}>Consent</Button>
                    <Button size="sm" variant="ghost" onClick={() => context.openOverlay("submission routing", { id: form.id })}>Routing</Button>
                  </>}>
                  <Properties rows={[
                    { label: "Writes to", value: bound ? bound.title : "No form record selected" },
                    { label: "Submissions", value: String(count) },
                    { label: "Spam control", value: form.honeypot ? "Hidden field check" : "None" },
                  ]} />
                </Card>
              );
            })}
          </Grid>
        )}
      </Stack>
    );
  }

  if (lens === "Fields") {
    if (!active) return <Empty title="Add a form first" icon={<Inbox size={20} />} />;
    return (
      <Grid>
        <Card span={7} title={`${active.name} fields`} subtitle="Order is the order a visitor meets them">
          <Stack gap={3}>
            <Field label="Form">
              <Select value={active.id} onChange={(event) => setSelectedFormId(event.target.value)}>
                {siteForms.map((form) => <option key={form.id} value={form.id}>{form.name}</option>)}
              </Select>
            </Field>
            <ReorderArea
              label={`${active.name} field order`}
              ids={active.fields.map((field) => field.id)}
              onDragEnd={(event) => {
                const from = active.fields.findIndex((field) => field.id === String(event.active.id));
                const to = active.fields.findIndex((field) => field.id === String(event.over?.id ?? ""));
                if (from < 0 || to < 0 || from === to) return;
                void writeForms(siteForms.map((form) => (form.id === active.id ? { ...form, fields: move(form.fields, from, to) } : form)), `${active.name} fields reordered`);
              }}
            >
              {active.fields.map((field, index) => (
                <SortableRow key={field.id} id={field.id} name={field.label} index={index} count={active.fields.length}
                  onMove={(from, to) => void writeForms(siteForms.map((form) => (form.id === active.id ? { ...form, fields: move(form.fields, from, to) } : form)), `${active.name} fields reordered`)}>
                  {({ handle }) => (
                    <Row gap={2} style={{ padding: "var(--space-2) var(--space-3)", alignItems: "center" }}>
                      {handle}
                      <span className="ds-grow"><strong>{field.label}</strong> <code className="ds-subtle">{field.type}</code></span>
                      {field.required && <Pill tone="warning">required</Pill>}
                      <Button size="sm" variant="ghost" onClick={() => context.openOverlay("Field editor", { formId: active.id, fieldId: field.id })}>Edit</Button>
                    </Row>
                  )}
                </SortableRow>
              ))}
            </ReorderArea>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Field editor", { formId: active.id })}>Add a field</Button>
          </Stack>
        </Card>
        <Card span={5} eyebrow="TEST" prov="human" title="Test it" subtitle="A real submission against the bound record">
          <SiteFormTester context={context} formRecordId={active.formRecordId} fields={active.fields} consent={active.consent} />
        </Card>
      </Grid>
    );
  }

  if (lens === "Submissions") {
    const bound = siteForms.map((form) => form.formRecordId).filter(Boolean);
    const rows = submissions.filter((row) => bound.includes(String(row.parentId ?? "")));
    return (
      <Stack gap={4}>
        <Notice tone="info" title="Submissions are read inside one organisation">
          This list is an indexed read scoped to {context.org.name}. A submission created in the other company in this browser is not in this query and cannot appear here.
        </Notice>
        {rows.length === 0 ? (
          <Empty title="No submissions yet" icon={<Inbox size={20} />}>Use the test form on the Fields tab to create one.</Empty>
        ) : (
          <DataGrid
            rows={rows}
            rowId={(row) => row.id}
            label="Site submissions"
            columns={[
              { key: "title", header: "From", primary: true, cell: (row) => row.title, sortValue: (row) => row.title, filterValue: (row) => `${row.title} ${row.summary}` },
              { key: "form", header: "Form", cell: (row) => forms.find((form) => form.id === row.parentId)?.title ?? "Unknown" },
              { key: "at", header: "Received", cell: (row) => context.dateTime(row.at ?? row.createdAt), sortValue: (row) => row.at ?? row.createdAt },
              { key: "status", header: "State", cell: (row) => <Pill tone={row.status === "new" ? "info" : "neutral"}>{row.status}</Pill> },
            ]}
            onOpen={(id) => context.openOverlay("submission routing", { submissionId: id })}
          />
        )}
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={7} title="Where a submission goes" subtitle="One destination is real; the other is not connected">
        <Stack gap={3}>
          {siteForms.map((form) => (
            <div key={form.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Row gap={2}><strong className="ds-grow">{form.name}</strong><Pill tone={form.route === "record" ? "success" : "info"}>{form.route === "record" ? "Creates a record" : "Held for review"}</Pill></Row>
              <Properties rows={[
                { label: "Record", value: forms.find((item) => item.id === form.formRecordId)?.title ?? "Not bound" },
                { label: "Webhook", value: form.webhook ? <code>{form.webhook}</code> : "None set" },
              ]} />
              <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                <Button size="sm" variant="secondary" onClick={() => context.openOverlay("submission routing", { id: form.id })}>Change routing</Button>
              </Row>
            </div>
          ))}
          {siteForms.length === 0 && <Empty title="No forms to route" icon={<Inbox size={20} />} />}
        </Stack>
      </Card>
      <Card span={5} eyebrow="NOTIFICATION" prov="unknown" title="Notification" subtitle="What a submission would trigger">
        <Stack gap={3}>
          <BoundaryNotice id="email.send" action="Notifying the studio" />
          <Checkbox label="Write an attention item when a submission arrives" defaultChecked />
          <Checkbox label="Hold submissions that fail the hidden field check" defaultChecked />
        </Stack>
      </Card>
    </Grid>
  );
}

export function SiteFormTester({
  context, formRecordId, fields, consent,
}: { context: ScreenContext; formRecordId: string; fields: { id: string; label: string; type: string; required: boolean }[]; consent: string }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const target = useRecord(formRecordId);

  if (!formRecordId || !target) {
    return <Notice tone="warning" title="No form record is bound">Choose a form on the Forms tab so a submission has a record to be written against.</Notice>;
  }
  if (target.organizationId !== context.org.id) {
    return <Notice tone="danger" title="That form belongs to another organisation">A submission is only ever written against a form record in {context.org.name}. Bind a form from this organisation first.</Notice>;
  }

  return (
    <form
      className="ds-stack ds-gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const missing = fields.filter((field) => field.required && !(values[field.id] ?? "").trim());
        if (missing.length) { setError(`${missing.map((field) => field.label).join(", ")} ${missing.length === 1 ? "is" : "are"} required.`); return; }
        if (!agreed) { setError("The consent line has to be accepted before a record is written."); return; }
        setError("");
        setBusy(true);
        try {
          await context.mutate.create({
            collection: "submissions",
            title: values[fields[0]?.id ?? ""] || "Site enquiry",
            status: "new",
            summary: `Submitted through the site form on ${target.title}.`,
            parentId: target.id,
            at: context.now.toISOString(),
            fields: { ...Object.fromEntries(fields.map((field) => [field.label, values[field.id] ?? ""])), consent: consent, test: true },
          }, `Site form submission received for ${target.title}`);
          context.toast("Submission recorded", `A record was created against ${target.title}. Nothing was emailed.`);
          setValues({});
          setAgreed(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((field) => (
        <Field key={field.id} label={field.label} required={field.required}>
          <TextInput
            type={field.type === "email" ? "email" : "text"}
            value={values[field.id] ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
          />
        </Field>
      ))}
      <Checkbox label={consent} checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
      {error && <Notice tone="danger" title="Not submitted">{error}</Notice>}
      <Button type="submit" variant="primary" busy={busy}>Submit a test enquiry</Button>
      <p className="ds-subtle">This writes a real submission record so the whole path can be checked, including the empty-field and consent rules.</p>
    </form>
  );
}

/* ---------------------------------------------------------------- *
 * Overlay bodies used by several WEB screens
 * ---------------------------------------------------------------- */

export function SiteSetupForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const sites = useCollection("sites");
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("A showroom site with a consultation enquiry form");
  const duplicate = sites.some((record) => record.title.trim().toLowerCase() === title.trim().toLowerCase());
  const suggested = suggestStructure(intent);
  return (
    <form
      id="site-setup"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || duplicate) return;
        const pages = suggested.pages.map((page) => ({
          ...makePage(page.name, page.path),
          blocks: page.blocks.map((type) => makeBlock(type)),
        }));
        const model: SiteModel = {
          ...readSite(undefined),
          pages,
          seo: { siteTitle: title.trim(), description: intent, robots: "index", sitemap: true },
          nav: { header: pages.map((page) => ({ id: `nav-${page.id}`, label: page.name, target: page.path, kind: "page" as const, children: [] })), footer: [], redirects: [] },
        };
        const created = await context.mutate.create({
          collection: "sites",
          title: title.trim(),
          status: "draft",
          summary: intent,
          fields: { delivery: "not_connected" },
          body: model,
        }, `Site ${title.trim()} created`);
        context.toast("Site created", `${created.title} has ${pages.length} pages and no host attached.`);
        close();
        context.navigate(`/o/${context.org.slug}/web/sites/${created.id}/builder`);
      }}
    >
      <Field label="Site name" required hint="Used as the record title and the default page title.">
        <TextInput value={title} onChange={(event) => setTitle(event.target.value)} invalid={duplicate} required />
      </Field>
      {duplicate && <Notice tone="danger" title="A site with that name already exists">Two sites with one name make the export filenames ambiguous.</Notice>}
      <Field label="What the site is for" hint="The starting structure below is chosen from the words in this brief.">
        <TextArea rows={3} value={intent} onChange={(event) => setIntent(event.target.value)} />
      </Field>
      <Card title="Starting structure" subtitle={suggested.why}>
        <Stack gap={2}>
          {suggested.pages.map((page) => (
            <Row key={page.path} gap={2}>
              <strong style={{ width: 110 }}>{page.name}</strong>
              <span className="ds-subtle ds-grow">{page.blocks.map((type) => BLOCK_LABELS[type]).join(" · ")}</span>
            </Row>
          ))}
        </Stack>
      </Card>
      <Notice tone="info" title="The structure is a starting point, not a decision">
        It is matched from keywords in the brief inside this browser. Every page and block stays editable, and nothing is generated by a language model.
      </Notice>
    </form>
  );
}

function suggestStructure(brief: string): { why: string; pages: { name: string; path: string; blocks: Parameters<typeof makeBlock>[0][] }[] } {
  const text = brief.toLowerCase();
  const wantsShop = /shop|product|price|buy|range|catalogue/.test(text);
  const wantsForm = /enquiry|contact|consult|booking|quote|form/.test(text);
  const wantsWork = /gallery|portfolio|work|photo|showroom/.test(text);
  const pages: { name: string; path: string; blocks: Parameters<typeof makeBlock>[0][] }[] = [
    { name: "Home", path: "/", blocks: ["hero", "columns", ...(wantsWork ? (["gallery"] as const) : []), "footer"] },
  ];
  if (wantsShop) pages.push({ name: "Range", path: "/range", blocks: ["hero", "pricing", "footer"] });
  if (wantsWork) pages.push({ name: "Work", path: "/work", blocks: ["hero", "gallery", "footer"] });
  if (wantsForm) pages.push({ name: "Contact", path: "/contact", blocks: ["hero", "form", "footer"] });
  const reasons = [
    wantsShop ? "a priced range" : "",
    wantsWork ? "a gallery of work" : "",
    wantsForm ? "an enquiry form" : "",
  ].filter(Boolean);
  return {
    why: reasons.length ? `Matched on ${reasons.join(", ")} in the brief.` : "No keywords matched, so a single page is proposed.",
    pages,
  };
}

export function LinkPickerForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { which?: "header" | "footer"; id?: string; parentId?: string } | undefined;
  const which = payload?.which ?? "header";
  const links = which === "footer" ? site.nav.footer : site.nav.header;
  const found = payload?.id ? findLink(links, payload.id) : undefined;
  const existing = found?.link;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [kind, setKind] = useState<NavLink["kind"]>(existing?.kind ?? "page");
  const [target, setTarget] = useState(existing?.target ?? site.pages[0]?.path ?? "/");
  const [parentId, setParentId] = useState(found?.parentId ?? payload?.parentId ?? "");
  const [tried, setTried] = useState(false);
  if (!record) return <NoSite />;
  const problem = targetProblem(site, kind, target);
  const parents = which === "header" && !(existing && existing.children.length > 0)
    ? links.filter((link) => link.id !== existing?.id) : [];
  return (
    <form
      id="link-picker"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setTried(true);
        if (!label.trim() || problem) return;
        const next: NavLink = { id: existing?.id ?? `n-${wallMs().toString(36)}`, label: label.trim(), kind, target: target.trim(), children: existing?.children ?? [] };
        const updated = placeLink(links, next, parentId);
        const under = parentId ? links.find((link) => link.id === parentId)?.label : "";
        await saveSite(context, record, { ...site, nav: { ...site.nav, [which]: updated } }, existing ? `Menu link ${next.label} updated` : `Menu link ${next.label} added${under ? ` under ${under}` : ""}`);
        context.toast("Menu saved", `${next.label} points at ${next.target}${under ? `, in the ${under} submenu` : ""}.`);
        close();
      }}
    >
      <Field label="Link text" required error={tried && !label.trim() ? "Give the link some text." : undefined}><TextInput value={label} onChange={(event) => setLabel(event.target.value)} required /></Field>
      <Field label="Kind">
        <Select value={kind} onChange={(event) => setKind(event.target.value as NavLink["kind"])}>
          <option value="page">A page on this site</option>
          <option value="anchor">An anchor on the current page</option>
          <option value="external">Another address</option>
        </Select>
      </Field>
      {kind === "page" ? (
        <Field label="Page" error={problem}>
          <Select value={target} onChange={(event) => setTarget(event.target.value)}>
            {site.pages.map((page) => <option key={page.id} value={page.path}>{page.name} · {page.path}</option>)}
          </Select>
        </Field>
      ) : (
        <Field label="Target" error={tried || target.trim() ? problem : undefined} hint={kind === "anchor" ? "For example #pricing" : "Include the scheme, for example https://example.com"}>
          <TextInput value={target} onChange={(event) => setTarget(event.target.value)} />
        </Field>
      )}
      {parents.length > 0 && (
        <Field label="Place in" hint="One level of submenu. A link that has its own submenu stays at the top.">
          <Select value={parentId} onChange={(event) => setParentId(event.target.value)} aria-label="Place in menu">
            <option value="">Top level of the header menu</option>
            {parents.map((link) => <option key={link.id} value={link.id}>Submenu of {link.label}</option>)}
          </Select>
        </Field>
      )}
    </form>
  );
}

export function RedirectForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(site.pages[0]?.path ?? "/");
  const [code, setCode] = useState<"301" | "302">("301");
  if (!record) return <NoSite />;
  const loop = from.trim() === to.trim() && from.trim() !== "";
  return (
    <form
      id="redirect-form"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!from.trim() || loop) return;
        await saveSite(context, record, {
          ...site,
          nav: { ...site.nav, redirects: [...site.nav.redirects, { id: redirectId(), from: from.trim(), to: to.trim(), code: code === "302" ? 302 : 301 }] },
        }, `Redirect ${from.trim()} added`);
        context.toast("Redirect added", `${from.trim()} will answer with a ${code}.`);
        close();
      }}
    >
      <Field label="Old address" required hint="The address that is already published or linked."><TextInput value={from} onChange={(event) => setFrom(event.target.value)} placeholder="/old-range" required /></Field>
      <Field label="New address">
        <Select value={to} onChange={(event) => setTo(event.target.value)}>
          {site.pages.map((page) => <option key={page.id} value={page.path}>{page.path}</option>)}
        </Select>
      </Field>
      <Field label="Status code" hint="301 moves link value permanently; 302 keeps the old address authoritative.">
        <Select value={code} onChange={(event) => setCode(event.target.value as "301" | "302")}>
          <option value="301">301 permanent</option>
          <option value="302">302 temporary</option>
        </Select>
      </Field>
      {loop && <Notice tone="danger" title="A redirect cannot point at itself">That rule would never resolve.</Notice>}
      <Notice tone="warning" title="Redirects need a server to take effect">
        The rule is stored with the site and written into the export notes. Nothing serves it until a host is connected.
      </Notice>
    </form>
  );
}

export function BrokenLinkScan({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const issues = auditSite(site, formNames).filter((issue) => issue.area === "Links");
  const broken = issues.filter((issue) => issue.level !== "pass");
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Links checked", value: String(issues.length) },
        { label: "Not resolving", value: <Pill tone={broken.length ? "danger" : "success"}>{broken.length}</Pill> },
        { label: "Method", value: "Every menu link, call to action and redirect target is matched against the page paths defined on this site." },
      ]} />
      {broken.length === 0 ? (
        <Notice tone="success" title="Every internal target resolves">External addresses are not fetched, because this workspace makes no network calls.</Notice>
      ) : (
        <Stack gap={2}>
          {broken.map((issue) => (
            <div key={issue.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
              <Row gap={2}><strong className="ds-grow">{issue.title}</strong><Pill tone={issue.level === "fail" ? "danger" : "warning"}>{issue.level}</Pill></Row>
              <p className="ds-subtle">{issue.detail}</p>
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function SchemaEditorForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = site.cms.collections.find((collection) => collection.id === payload?.id);
  const [name, setName] = useState(existing?.name ?? "");
  const [fieldText, setFieldText] = useState(
    existing ? existing.fields.map((field) => `${field.name}:${field.type}${field.required ? ":required" : ""}`).join("\n") : "title:text\nsummary:longtext",
  );
  if (!record) return <NoSite />;

  const parsed: CmsField[] = fieldText.split("\n").map((line) => line.trim()).filter(Boolean).map((line, index) => {
    const [rawName, rawType, rawFlag] = line.split(":").map((part) => part.trim());
    const type = (["text", "longtext", "number", "date", "boolean", "reference"].includes(rawType) ? rawType : "text") as CmsField["type"];
    return { id: existing?.fields[index]?.id ?? `f-${index + 1}`, name: rawName || `Field ${index + 1}`, type, required: rawFlag === "required", refCollection: type === "reference" ? (rawFlag && rawFlag !== "required" ? rawFlag : "") : "" };
  });
  const removed = existing ? existing.fields.filter((field) => !parsed.some((next) => next.id === field.id)) : [];
  const affected = existing
    ? site.cms.entries.filter((entry) => entry.collectionId === existing.id && entry.status === "published" && removed.some((field) => entry.values[field.id]))
    : [];

  return (
    <form
      id="schema-editor"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const collection: CmsCollection = { id: existing?.id ?? `col-${wallMs().toString(36)}`, name: name.trim(), slug: slugify(name), fields: parsed };
        const collections = existing
          ? site.cms.collections.map((item) => (item.id === existing.id ? collection : item))
          : [...site.cms.collections, collection];
        await saveSite(context, record, { ...site, cms: { ...site.cms, collections } }, existing ? `Schema of ${collection.name} changed` : `Collection ${collection.name} created`);
        context.toast("Schema saved", `${collection.name} has ${parsed.length} fields.`);
        close();
      }}
    >
      <Field label="Collection name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      <Field label="Fields" required hint="One per line as name:type, optionally :required. Types: text, longtext, number, date, boolean, reference.">
        <TextArea rows={7} value={fieldText} onChange={(event) => setFieldText(event.target.value)} />
      </Field>
      <Properties rows={[
        { label: "Parsed fields", value: String(parsed.length) },
        { label: "Address", value: <code>/{slugify(name || "collection")}</code> },
      ]} />
      {affected.length > 0 && (
        <Notice tone="danger" title={`${affected.length} published ${affected.length === 1 ? "entry" : "entries"} would lose content`}>
          Removing {removed.map((field) => field.name).join(", ")} drops values that are live on the site. Export the entries first, or keep the field and stop rendering it.
        </Notice>
      )}
    </form>
  );
}

export function MigrationPreview({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const collection = site.cms.collections.find((item) => item.id === payload?.id) ?? site.cms.collections[0];
  if (!record || !collection) return <Empty title="No collection selected" icon={<Database size={20} />} />;
  const entries = site.cms.entries.filter((entry) => entry.collectionId === collection.id);
  const published = entries.filter((entry) => entry.status === "published");
  const missing = collection.fields.filter((field) => field.required).map((field) => ({
    field,
    gaps: entries.filter((entry) => !(entry.values[field.id] ?? "").trim()).length,
  }));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Collection", value: collection.name },
        { label: "Entries", value: `${entries.length} (${published.length} published)` },
        { label: "Fields", value: String(collection.fields.length) },
      ]} />
      <h4>Required fields against the entries that exist</h4>
      <Stack gap={2}>
        {missing.length === 0 && <span className="ds-subtle">No field is marked required.</span>}
        {missing.map(({ field, gaps }) => (
          <Row key={field.id} gap={2}>
            <span className="ds-grow">{field.name}</span>
            <Pill tone={gaps === 0 ? "success" : "danger"}>{gaps === 0 ? "every entry has a value" : `${gaps} entries empty`}</Pill>
          </Row>
        ))}
      </Stack>
      <Notice tone={published.length ? "warning" : "info"} title="What a migration must preserve">
        {published.length
          ? `${published.length} published ${published.length === 1 ? "entry is" : "entries are"} rendered on the site. A schema change that empties a field changes those pages, so the entries are exported before the change is applied.`
          : "Nothing in this collection is published, so a schema change cannot alter a live page."}
      </Notice>
    </Stack>
  );
}

export function EntryDetailForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string; collectionId?: string } | undefined;
  const collection = site.cms.collections.find((item) => item.id === payload?.collectionId) ?? site.cms.collections[0];
  const existing = site.cms.entries.find((entry) => entry.id === payload?.id);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [values, setValues] = useState<Record<string, string>>(existing?.values ?? {});
  const [loadedId, setLoadedId] = useState(existing?.id);
  /* The site is read asynchronously, so the entry can arrive after the first render. */
  if (existing && loadedId !== existing.id) {
    setLoadedId(existing.id);
    setTitle(existing.title);
    setValues(existing.values);
  }
  if (!record || !collection) return <Empty title="No collection to write into" icon={<Database size={20} />} />;
  const missing = collection.fields.filter((field) => field.required && !(values[field.id] ?? "").trim());
  return (
    <form
      id="entry-detail"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!title.trim() || missing.length) return;
        const entry: CmsEntry = {
          id: existing?.id ?? `e-${wallMs().toString(36)}`,
          collectionId: collection.id,
          title: title.trim(),
          status: existing?.status ?? "draft",
          values,
        };
        const entries = existing ? site.cms.entries.map((item) => (item.id === existing.id ? entry : item)) : [...site.cms.entries, entry];
        await saveSite(context, record, { ...site, cms: { ...site.cms, entries } }, existing ? `Entry ${entry.title} edited` : `Entry ${entry.title} created`);
        context.toast("Entry saved", `${entry.title} is ${entry.status} in ${collection.name}.`);
        close();
      }}
    >
      <Field label="Entry title" required><TextInput value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
      {collection.fields.map((field) => (
        <Field key={field.id} label={field.name} required={field.required} hint={field.type === "reference" ? `Reference into ${field.refCollection || "an unset collection"}` : undefined}>
          {field.type === "longtext"
            ? <TextArea rows={3} value={values[field.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))} />
            : <TextInput
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={values[field.id] ?? ""}
              invalid={field.required && !(values[field.id] ?? "").trim()}
              onChange={(event) => setValues((current) => ({ ...current, [field.id]: event.target.value }))}
            />}
        </Field>
      ))}
      {missing.length > 0 && <Notice tone="danger" title="Required fields are empty">{missing.map((field) => field.name).join(", ")}</Notice>}
    </form>
  );
}

export function ComponentPropertyForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const existing = site.components.find((item) => item.id === payload?.id);
  const ui = useWebUi();
  const page = site.pages.find((item) => item.id === ui.pageId) ?? site.pages[0];
  const [name, setName] = useState(existing?.name ?? "");
  const [shared, setShared] = useState(existing?.shared ?? false);
  const [variants, setVariants] = useState((existing?.variants ?? []).join(", "));
  const [sourcePage, setSourcePage] = useState(page?.id ?? "");
  if (!record) return <NoSite />;
  const source = site.pages.find((item) => item.id === sourcePage) ?? page;
  return (
    <form
      id="component-property"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!name.trim()) return;
        const component = {
          id: existing?.id ?? `c-${wallMs().toString(36)}`,
          name: name.trim(),
          shared,
          variants: variants.split(",").map((item) => item.trim()).filter(Boolean),
          usedOn: existing?.usedOn ?? (source ? [source.name] : []),
          blocks: existing?.blocks ?? (source ? source.blocks.slice(0, 2) : []),
        };
        const components = existing ? site.components.map((item) => (item.id === existing.id ? component : item)) : [...site.components, component];
        await saveSite(context, record, { ...site, components }, existing ? `Component ${component.name} updated` : `Component ${component.name} extracted from ${source?.name ?? "the site"}`);
        context.toast("Component saved", `${component.name} holds ${component.blocks.length} blocks.`);
        close();
      }}
    >
      <Field label="Component name" required><TextInput value={name} onChange={(event) => setName(event.target.value)} required /></Field>
      {!existing && (
        <Field label="Extract from" hint="The first two blocks of the chosen page are copied into the component.">
          <Select value={sourcePage} onChange={(event) => setSourcePage(event.target.value)}>
            {site.pages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label="Variants" hint="Comma separated, for example: image left, image right"><TextInput value={variants} onChange={(event) => setVariants(event.target.value)} /></Field>
      <Checkbox label="Share with other sites in this workspace" checked={shared} onChange={(event) => setShared(event.target.checked)} />
      {source && !existing && (
        <Notice tone="info" title="What would be copied">{source.blocks.slice(0, 2).map((block) => BLOCK_LABELS[block.type]).join(" · ") || "That page has no blocks."}</Notice>
      )}
    </form>
  );
}

export function BreakingChangePreview({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  const component = site.components.find((item) => item.id === payload?.id) ?? site.components[0];
  if (!record || !component) return <Empty title="No component selected" icon={<Shapes size={20} />} />;
  const matches = site.pages.filter((page) => page.blocks.some((block) => component.blocks.some((inner) => inner.type === block.type)));
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Component", value: component.name },
        { label: "Blocks", value: component.blocks.map((block) => BLOCK_LABELS[block.type]).join(" · ") },
        { label: "Pages that would change", value: String(matches.length) },
      ]} />
      <Stack gap={2}>
        {matches.map((page) => (
          <Row key={page.id} gap={2}><span className="ds-grow">{page.name}</span><code className="ds-subtle">{page.path}</code><Pill tone="warning">would be replaced</Pill></Row>
        ))}
        {matches.length === 0 && <span className="ds-subtle">No page currently uses blocks of these types.</span>}
      </Stack>
      <Notice tone={matches.length > 1 ? "danger" : "warning"} title="A global edit is shown before it is applied">
        {matches.length > 1
          ? `Replacing this component rewrites ${matches.length} pages in one write. Each page is listed above so the change is reviewed, not discovered afterwards.`
          : "Only one page is affected, so this change is low risk."}
      </Notice>
      <Notice tone="info" title="Nothing has been written">This panel only reads the model. Closing it leaves every page as it is.</Notice>
    </Stack>
  );
}

export function TokenUpdatePanel({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return <NoSite />;
  return (
    <Stack gap={4}>
      <Notice tone="info" title="Tokens are site-wide">A token change reaches every block on every page and the export at once. The contrast figures update as you change them.</Notice>
      <ThemeEditor site={site} onChange={(theme) => void saveSite(context, record, { ...site, theme }, "Theme tokens changed")} />
    </Stack>
  );
}
