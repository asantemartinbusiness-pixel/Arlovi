import {
  Database, FileCode2, Gauge, Globe, LayoutPanelTop, Link2, ListOrdered, Rocket, Shapes, TrendingUp,
} from "lucide-react";
import {
  Button, Checkbox, DrawerActions, Empty, FactGrid, Field, Notice, OverlayActions, OverlayCancel, OverlaySection, Pill, Row, Select, Stack, TextArea, TextInput,
} from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { siteSummary } from "./summary";
import { BoundaryNotice, CapabilityCard, closeFooter, submitFooter } from "@/applications/t6kit/kit";
import { capabilityById } from "@/platform/capability";
import { BLOCK_LABELS, readSite, type SiteModel } from "./model";
import { PageBuilder } from "./builder";
import { PageManager } from "./pagesPanel";
import {
  BrokenLinkScan, CmsEditor, ComponentLibrary, ComponentPropertyForm,
  EntryDetailForm, LinkPickerForm, MigrationPreview, NoSite, RedirectForm, SchemaEditorForm,
  SiteDashboard, SiteDirectory, SiteForms, SiteNavigation, SiteStatusStrip, TokenUpdatePanel,
  useSiteRecord,
} from "./panels";
import {
  AnalyticsPanel, AttributionNote, AuditReport, CodeDiffPanel, DeployConsole, DeploymentIssue,
  DnsInstructions, DomainAttachForm, DomainCheck, EventSetup, IssueDetail, MetricSource,
  PublishReview, PublishSummary, QualityReport, RunAuditAction,
} from "./quality";
import { saveSite } from "./state";
import {
  ChartBuilder, ComparePeriods, SitePreview, TestSubmissionPanel, bulkPublish, exportAnalytics, importComponents,
  insertBlock, pickEntry, publishComponent, publishSiteForm, reorderBlock, reorderMenu, resizeBlock, retestAudit,
  rollbackDeployment, updateEverywhere,
} from "./actions";

/* ====================================================================== *
 * WEB — Websites, CMS & Hosting
 * A site is a structural document: pages of typed blocks, a theme, a menu,
 * content collections and forms. Everything a screen shows is computed from
 * that document, and publishing stops where hosting begins.
 * ====================================================================== */

function SiteSettingsForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return <NoSite />;
  return (
    <form
      id="site-settings"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next: SiteModel = {
          ...site,
          seo: {
            siteTitle: String(data.get("siteTitle") ?? site.seo.siteTitle),
            description: String(data.get("description") ?? ""),
            robots: data.get("robots") === "noindex" ? "noindex" : "index",
            sitemap: data.get("sitemap") === "on",
          },
          analytics: { consent: (String(data.get("consent") ?? "not_asked") as SiteModel["analytics"]["consent"]) },
        };
        const pageName = String(data.get("newPage") ?? "").trim();
        if (pageName) {
          const path = `/${pageName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          if (!site.pages.some((page) => page.path === path)) {
            const { makePage } = await import("./model");
            next.pages = [...site.pages, makePage(pageName, path)];
            next.nav = { ...site.nav, header: [...site.nav.header, { id: `n-${wallMs().toString(36)}`, label: pageName, target: path, kind: "page", children: [] }] };
          }
        }
        if (!(await saveSite(context, record, next, pageName ? `Site settings saved and page ${pageName} added` : "Site settings saved"))) return;
        context.toast("Settings saved", pageName ? `${pageName} was added to the site and the menu.` : "Applied to every page and the export.");
        close();
      }}
    >
      <OverlaySection title="Identity">
        <Stack gap={3}>
        <Field label="Site title" required><TextInput name="siteTitle" defaultValue={site.seo.siteTitle} required /></Field>
        <Field label="Site description" hint="Used where a page has no description of its own."><TextArea name="description" rows={3} defaultValue={site.seo.description} /></Field>
        </Stack>
      </OverlaySection>
      <OverlaySection title="Search engines">
        <Stack gap={3}>
        <Field label="Robots">
          <Select name="robots" defaultValue={site.seo.robots}>
            <option value="index">index — allow listing</option>
            <option value="noindex">noindex — ask not to be listed</option>
          </Select>
        </Field>
        <Checkbox name="sitemap" label="Generate a sitemap on export" defaultChecked={site.seo.sitemap} />
        </Stack>
      </OverlaySection>
      <OverlaySection title="Analytics consent" hint="No banner and no counting; this records the decision.">
        <Stack gap={3}>
        <Field label="Analytics consent state">
          <Select name="consent" defaultValue={site.analytics.consent}>
            <option value="not_asked">Not asked</option>
            <option value="granted">Granted</option>
            <option value="declined">Declined</option>
          </Select>
        </Field>
        </Stack>
      </OverlaySection>
      <OverlaySection title="New route" hint="Leave empty to change settings only. A new page is added to the menu as well.">
        <Stack gap={3}>
        <Field label="Add a page"><TextInput name="newPage" placeholder="About" /></Field>
        </Stack>
      </OverlaySection>
    </form>
  );
}

function DeployInspector({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const capability = capabilityById("site.publish");
  const last = [...site.deployments].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))[0];
  const failing = require0(site, formNames);
  return (
    <Stack gap={4}>
      <OverlaySection title="State right now" hint="Read from the site model and its recorded attempts.">
        <FactGrid columns={2} items={[
          { label: "Last attempt", value: last ? context.dateTime(last.at) : "Never attempted", hint: last ? last.state.replace("_", " ") : undefined, mono: true },
          { label: "Routes in the model", value: String(site.pages.length), mono: true },
          { label: "Failing checks", value: String(failing), mono: true, tone: failing > 0 ? "danger" : "success" },
          { label: "Verified domain", value: site.domains.some((domain) => domain.verified) ? "Yes" : "No", tone: site.domains.some((domain) => domain.verified) ? "success" : "warning" },
        ]} />
      </OverlaySection>
      {capability && <CapabilityCard capability={capability} scopes={["sites:write", "domains:verify", "certificates:issue"]} />}
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" onClick={() => context.openOverlay("Publish review", { environment: "production" })}>Open the publish review</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function require0(site: SiteModel, formNames: Record<string, string>): number {
  const { auditSite, issueCounts } = { auditSite: AUDIT.auditSite, issueCounts: AUDIT.issueCounts };
  return issueCounts(auditSite(site, formNames)).fail;
}

import * as ModelModule from "./model";
const AUDIT = { auditSite: ModelModule.auditSite, issueCounts: ModelModule.issueCounts };


function AiEditDiff({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  const ui = STATE.useWebUi();
  if (!record) return <NoSite />;
  const page = site.pages.find((item) => item.id === ui.pageId) ?? site.pages[0];
  const block = page?.blocks.find((item) => item.id === ui.selectedBlockId);
  return (
    <Stack gap={4}>
      <BoundaryNotice id="model.inference" action="Generating a block from a description" />
      <OverlaySection title="This edit">
        <FactGrid columns={2} items={[
          { label: "Proposed by", value: "Nothing: no model is connected", tone: "warning" },
          { label: "Applied so far", value: "No changes", mono: true },
          { label: "Target", value: block ? `${block.type} block on ${page.name}` : "No block selected" },
          { label: "Undo", value: `${STATE.useWebUi.getState().undoDepth(record.id)} builder changes can be undone`, mono: true },
        ]} />
      </OverlaySection>
      <p className="ds-subtle">A proposal would arrive here as a diff of the blocks added, removed and reordered, accepted or rejected as a whole.</p>
      <DrawerActions>
        <OverlayActions
          primary={<Button variant="primary" disabled={!block} title={block ? undefined : "Select a block on the canvas first"} onClick={() => context.openOverlay("Element inspector")}>Edit the selected block directly</Button>}
          end={<OverlayCancel>Close</OverlayCancel>}
        />
      </DrawerActions>
    </Stack>
  );
}

function ElementInspectorOverlay({ context }: { context: ScreenContext }) {
  const { record, site, formNames } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const { useWebUi } = STATE;
  const ui = useWebUi.getState();
  const page = site.pages.find((item) => item.id === ui.pageId) ?? site.pages[0];
  const block = page.blocks.find((item) => item.id === ui.selectedBlockId);
  if (!block) {
    return <Empty title="No block is selected" icon={<LayoutPanelTop size={20} />}>Select a block on the canvas, then open this inspector to edit its content.</Empty>;
  }
  const { BlockInspector } = BUILDER;
  const position = page.blocks.findIndex((item) => item.id === block.id) + 1;
  return (
    <Stack gap={3}>
    <header className="web-insp-head">
      <div className="ds-grow">
        <span className="ds-eyebrow">Selected · {position} of {page.blocks.length}</span>
        <strong className="web-insp-title">{BLOCK_LABELS[block.type]} block</strong>
      </div>
      <Pill tone="accent">{page.name}</Pill>
    </header>
    <BlockInspector
      bare
      block={block}
      site={site}
      forms={formNames}
      onEdit={(patch) => void saveSite(context, record, {
        ...site,
        pages: site.pages.map((item) => (item.id === page.id ? { ...item, blocks: item.blocks.map((inner) => (inner.id === block.id ? { ...inner, props: { ...inner.props, ...patch } } : inner)) } : item)),
      }, `Edited a ${block.type} block on ${page.name}`)}
    />
    </Stack>
  );
}

import * as StateModule from "./state";
import * as BuilderModule from "./builder";
const STATE = { useWebUi: StateModule.useWebUi };
const BUILDER = { BlockInspector: BuilderModule.BlockInspector };

export const webApp = registerApp({
  code: "WEB",
  short: "Websites",
  name: "Websites, CMS & Hosting",
  purpose: "Build a site as a real document, then export it",
  icon: Globe,
  nav: [
    { items: [{ label: "Sites", screenId: "ARL-WEB-001", icon: Globe }] },
    {
      label: "This site", items: [
        { label: "Dashboard", screenId: "ARL-WEB-002", icon: Gauge },
        { label: "Page builder", screenId: "ARL-WEB-003", icon: LayoutPanelTop },
        { label: "Components", screenId: "ARL-WEB-004", icon: Shapes },
        { label: "Content", screenId: "ARL-WEB-005", icon: Database },
        { label: "Navigation", screenId: "ARL-WEB-006", icon: Link2 },
        { label: "Forms", screenId: "ARL-WEB-007", icon: ListOrdered },
      ],
    },
    {
      label: "Ship", items: [
        { label: "Quality", screenId: "ARL-WEB-008", icon: FileCode2 },
        { label: "Domains & publishing", screenId: "ARL-WEB-009", icon: Rocket },
        { label: "Analytics", screenId: "ARL-WEB-010", icon: TrendingUp },
      ],
    },
  ],
  screens: {
    "ARL-WEB-001": {
      id: "ARL-WEB-001",
      subtitle: (context) => `Sites kept in ${context.org.name}. A site is live only when a verified domain and a recorded health check say so.`,
      tabs: (["All", "Draft", "Published", "Archived"] as const).map((scope) => ({
        id: scope,
        render: (context: ScreenContext) => <SiteDirectory context={context} scope={scope} />,
      })),
      actions: [
        { id: "Create", label: "New site", placement: "primary", run: (context) => context.openOverlay("Site setup") },
        {
          id: "open", label: "Open", placement: "secondary",
          guard: (context) => (context.selectedId ? undefined : "Select a site first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/web/sites/${context.selectedId}`),
        },
        {
          id: "duplicate", label: "Duplicate", placement: "overflow",
          guard: (context) => (context.selectedId ? undefined : "Select a site first"),
          run: async (context) => {
            const source = await import("@/platform/repo").then((module) => module.getRecord(context.selectedId ?? ""));
            if (!source) { context.toast("Nothing to duplicate", "Select a site row first.", "blocked"); return; }
            const created = await context.mutate.create({
              collection: "sites",
              title: `${source.title} copy`,
              status: "draft",
              summary: source.summary,
              fields: { ...source.fields, delivery: "not_connected" },
              body: { ...readSite(source), domains: [], deployments: [] },
            }, `Site ${source.title} duplicated`);
            context.toast("Site duplicated", `${created.title} has the same pages, no domain and no deployment history.`);
          },
        },
        {
          id: "archive", label: "Archive", placement: "overflow", tone: "danger",
          guard: (context) => (context.selectedId ? undefined : "Select a site first"),
          run: async (context) => {
            if (!(await context.mutate.patch(context.selectedId!, { status: "archived" }, { event: "Site archived" }))) return;
            context.toast("Site archived", "It stays in the Archived tab with its pages intact.");
          },
        },
        { id: "inspect health", label: "Inspect health", placement: "overflow", run: (context) => context.openOverlay("publish status") },
      ],
      overlays: [
        {
          id: "Site setup", kind: "modal", title: "New site", width: 620,
          render: ({ close, ...context }) => <SiteSetupFormLazy context={context} close={close} />,
          footer: submitFooter("site-setup", "Create the site"),
        },
        {
          id: "domain attach", kind: "modal", title: "Attach a domain", width: 520,
          render: ({ close, ...context }) => <DomainAttachForm context={context} close={close} />,
          footer: submitFooter("domain-attach", "Record the domain"),
        },
        {
          id: "publish status", kind: "drawer", title: "Publication state", width: 520,
          render: ({ ...context }) => <DeployInspector context={context} />,
        },
      ],
    },

    "ARL-WEB-002": {
      id: "ARL-WEB-002",
      title: () => "Site dashboard",
      subtitle: (context) => `Everything measured about this site in ${context.org.shortName}, and everything that is not.`,
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Overview", "Pages", "Content", "Analytics", "Settings"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SiteDashboard context={context} lens={lens} />,
      })),
      actions: [
        { id: "Open editor", label: "Open the builder", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/web/sites/${context.params.id ?? ""}/builder`) },
        { id: "preview", label: "Preview", placement: "secondary", run: (context) => context.openOverlay("site preview") },
        { id: "view logs", label: "View logs", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/web/sites/${context.params.id ?? ""}/deploy?tab=Logs`) },
        { id: "deploy", label: "Deploy", placement: "overflow", run: (context) => context.openOverlay("Publish review", { environment: "production" }) },
      ],
      overlays: [
        { id: "Manage pages", kind: "drawer", summary: siteSummary, title: "Pages", width: 560, render: ({ ...context }) => <PageManager context={context} /> },
        { id: "Deploy inspector", kind: "drawer", summary: siteSummary, title: "Deployment", width: 520, render: ({ ...context }) => <DeployInspector context={context} /> },
        { id: "domain check", kind: "modal", summary: siteSummary, title: "Domain check", width: 540, render: ({ ...context }) => <DomainCheck context={context} />, footer: closeFooter() },
        {
          id: "site settings", kind: "modal", summary: siteSummary, title: "Site settings", width: 560,
          render: ({ close, ...context }) => <SiteSettingsForm context={context} close={close} />,
          footer: submitFooter("site-settings", "Save settings"),
        },
        {
          id: "Publish review", kind: "modal", title: "Publish review", width: 640,
          summary: ({ close: _close, ...context }) => <PublishSummary context={context} />,
          render: ({ close, ...context }) => <PublishReview context={context} close={close} />,
        },
        { id: "site preview", kind: "modal", summary: siteSummary, title: "Preview", width: 1360, render: ({ ...context }) => <SitePreview context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-WEB-003": {
      id: "ARL-WEB-003",
      chrome: "full",
      surface: (context) => <PageBuilder context={context} />,
      tabs: (["Build", "Style", "Responsive", "Interactions"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PageBuilder context={context} />,
      })),
      actions: [
        { id: "Drag component", label: "Insert a block", placement: "primary", run: (context) => context.openOverlay("insert panel") },
        { id: "manage pages", label: "Manage pages", placement: "overflow", run: (context) => context.openOverlay("Manage pages") },
        {
          id: "edit text", label: "Edit block", placement: "secondary",
          run: (context) => {
            if (!StateModule.useWebUi.getState().selectedBlockId) { context.toast("Select a block first", "Choose a block on the canvas or in the list, then edit it.", "blocked"); return; }
            context.openOverlay("Element inspector");
          },
        },
        {
          id: "resize", label: "Resize the block", placement: "overflow",
          guard: () => (StateModule.useWebUi.getState().selectedBlockId ? undefined : "Select a block on the canvas first"),
          run: (context) => context.openOverlay("resize block"),
        },
        {
          id: "next breakpoint", label: "Next breakpoint", placement: "overflow",
          run: (context) => {
            const next = StateModule.useWebUi.getState().cycleBreakpoint();
            context.toast("Breakpoint changed", `The canvas now renders at ${next === "mobile" ? 390 : next === "tablet" ? 768 : 1280}px and the layout is recomputed.`);
          },
        },
        {
          id: "reorder", label: "Move the block", placement: "overflow",
          guard: () => (StateModule.useWebUi.getState().selectedBlockId ? undefined : "Select a block on the canvas first"),
          run: (context) => context.openOverlay("reorder blocks"),
        },
        {
          id: "undo", label: "Undo", placement: "overflow",
          run: async (context) => {
            const sites = await import("@/platform/repo").then((module) => module.listByCollection(context.org.id, "sites"));
            const record = sites.find((item) => item.id === context.params.id) ?? sites[0];
            if (!record) return;
            const done = await StateModule.undoSite(context, record);
            context.toast(done ? "Undone" : "Nothing to undo", done ? "The previous structure was written back." : "No builder change is on the undo stack.", done ? "ok" : "blocked");
          },
        },
      ],
      overlays: [
        { id: "Element inspector", kind: "drawer", summary: siteSummary, title: "Element", width: 460, render: ({ ...context }) => <ElementInspectorOverlay context={context} /> },
        { id: "Manage pages", kind: "drawer", summary: siteSummary, title: "Pages", width: 560, render: ({ ...context }) => <PageManager context={context} /> },
        insertBlock, resizeBlock, reorderBlock,
        { id: "AI edit diff", kind: "drawer", summary: siteSummary, title: "Proposed edit", width: 520, render: ({ ...context }) => <AiEditDiff context={context} /> },
      ],
    },

    "ARL-WEB-004": {
      id: "ARL-WEB-004",
      subtitle: () => "Sections extracted from pages, with the pages they would change listed before any global edit.",
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Local", "Shared", "Variants", "Usage"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ComponentLibrary context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create", label: "Extract a section", placement: "primary", run: (context) => context.openOverlay("Component property") },
        { id: "import", label: "Import a component", placement: "secondary", run: (context) => context.openOverlay("import components") },
        { id: "update", label: "Update everywhere", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("breaking change") },
        { id: "publish", label: "Publish to the workspace", placement: "overflow", run: (context) => context.openOverlay("publish component") },
        { id: "design tokens", label: "Design tokens", placement: "overflow", run: (context) => context.openOverlay("token update") },
      ],
      overlays: [
        {
          id: "Component property", kind: "modal", summary: siteSummary, title: "Component", width: 560,
          render: ({ close, ...context }) => <ComponentPropertyForm context={context} close={close} />,
          footer: submitFooter("component-property", "Save component"),
        },
        updateEverywhere, publishComponent, importComponents,
        { id: "token update", kind: "drawer", summary: siteSummary, title: "Design tokens", width: 420, render: ({ ...context }) => <TokenUpdatePanel context={context} /> },
      ],
    },

    "ARL-WEB-005": {
      id: "ARL-WEB-005",
      subtitle: () => "Repeated content with a schema, so a change of shape is a reviewed migration rather than a surprise.",
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Collections", "Entries", "Relations", "Import"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CmsEditor context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create collection", label: "New collection", placement: "primary", run: (context) => context.openOverlay("Schema editor") },
        { id: "edit entry", label: "Edit an entry", placement: "secondary", run: (context) => context.openOverlay("pick entry") },
        { id: "bulk publish", label: "Publish entries in bulk", placement: "overflow", run: (context) => context.openOverlay("bulk publish") },
        { id: "import", label: "Import CSV", placement: "overflow", run: (context) => context.setTab("Import") },
        { id: "new entry", label: "New entry", placement: "overflow", run: (context) => context.openOverlay("entry detail") },
      ],
      overlays: [
        {
          id: "Schema editor", kind: "modal", summary: siteSummary, title: "Collection schema", width: 600,
          render: ({ close, ...context }) => <SchemaEditorForm context={context} close={close} />,
          footer: submitFooter("schema-editor", "Save schema"),
        },
        {
          id: "entry detail", kind: "drawer", summary: siteSummary, title: "Entry", width: 520,
          render: ({ close, ...context }) => <EntryDetailForm context={context} close={close} />,
          footer: submitFooter("entry-detail", "Save entry"),
        },
        { id: "migration preview", kind: "modal", summary: siteSummary, title: "Migration check", width: 560, render: ({ ...context }) => <MigrationPreview context={context} />, footer: closeFooter() },
        bulkPublish, pickEntry,
      ],
    },

    "ARL-WEB-006": {
      id: "ARL-WEB-006",
      subtitle: () => "Menus, nesting and redirects. Removing a route shows what currently points at it.",
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Header", "Footer", "Mobile", "Redirects"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SiteNavigation context={context} lens={lens} />,
      })),
      actions: [
        { id: "add route", label: "Add a route", placement: "primary", run: (context) => context.openOverlay("Link picker", { which: context.tab === "Footer" ? "footer" : "header" }) },
        { id: "Reorder", label: "Reorder the menu", placement: "secondary", run: (context) => context.openOverlay("reorder menu") },
        { id: "preview", label: "Preview at 390px", placement: "overflow", run: (context) => context.setTab("Mobile") },
        { id: "publish", label: "Publish review", placement: "overflow", run: (context) => context.openOverlay("Publish review", { environment: "production" }) },
      ],
      overlays: [
        {
          id: "Link picker", kind: "modal", summary: siteSummary, title: "Menu link", width: 520,
          render: ({ close, ...context }) => <LinkPickerForm context={context} close={close} />,
          footer: submitFooter("link-picker", "Save link"),
        },
        {
          id: "redirect rules", kind: "modal", summary: siteSummary, title: "Redirect", width: 520,
          render: ({ close, ...context }) => <RedirectForm context={context} close={close} />,
          footer: submitFooter("redirect-form", "Add redirect"),
        },
        { id: "broken link scan", kind: "drawer", summary: siteSummary, title: "Link scan", width: 520, render: ({ ...context }) => <BrokenLinkScan context={context} /> },
        { id: "Publish review", kind: "modal", title: "Publish review", width: 640, summary: ({ close: _close, ...context }) => <PublishSummary context={context} />, render: ({ close, ...context }) => <PublishReview context={context} close={close} /> },
        reorderMenu,
      ],
    },

    "ARL-WEB-007": {
      id: "ARL-WEB-007",
      subtitle: (context) => `Site forms write submission records inside ${context.org.name} and nowhere else.`,
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Forms", "Fields", "Submissions", "Routing"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SiteForms context={context} lens={lens} />,
      })),
      actions: [
        { id: "Edit form", label: "Edit fields", placement: "primary", run: (context) => context.setTab("Fields") },
        { id: "test", label: "Test a submission", placement: "secondary", run: (context) => context.openOverlay("test submission") },
        { id: "set webhook", label: "Set a webhook", placement: "overflow", run: (context) => context.openOverlay("submission routing") },
        { id: "publish", label: "Publish a form version", placement: "overflow", run: (context) => context.openOverlay("publish site form") },
        { id: "consent text", label: "Consent text", placement: "overflow", run: (context) => context.openOverlay("consent inspector") },
      ],
      overlays: [
        {
          id: "Field editor", kind: "modal", summary: siteSummary, title: "Form field", width: 520,
          render: ({ close, ...context }) => <SiteFieldEditor context={context} close={close} />,
          footer: submitFooter("site-field", "Save field"),
        },
        { id: "consent inspector", kind: "drawer", summary: siteSummary, title: "Consent", width: 480, render: ({ ...context }) => <ConsentInspector context={context} /> },
        {
          id: "submission routing", kind: "modal", summary: siteSummary, title: "Submission routing", width: 560,
          render: ({ close, ...context }) => <RoutingForm context={context} close={close} />,
          footer: submitFooter("site-routing", "Save routing"),
        },
        { id: "test submission", kind: "drawer", summary: siteSummary, title: "Test a submission", width: 520, render: ({ ...context }) => <TestSubmissionPanel context={context} /> },
        publishSiteForm,
      ],
    },

    "ARL-WEB-008": {
      id: "ARL-WEB-008",
      title: () => "Quality report",
      subtitle: () => "Every row says what was measured. No conformance level is claimed.",
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["SEO", "Accessibility", "Performance", "Links"] as const).map((area) => ({
        id: area,
        render: (context: ScreenContext) => <QualityReport context={context} area={area} />,
      })),
      actions: [
        {
          id: "Run audit", label: "Run the audit", placement: "primary",
          run: async (context) => {
            const sites = await import("@/platform/repo").then((module) => module.listByCollection(context.org.id, "sites"));
            const forms = await import("@/platform/repo").then((module) => module.listByCollection(context.org.id, "forms"));
            const record = sites.find((item) => item.id === context.params.id) ?? sites[0];
            if (!record) return;
            await RunAuditAction(context, record, readSite(record), Object.fromEntries(forms.map((form) => [form.id, form.title])), clockIso());
          },
        },
        { id: "view issue", label: "Inspect an issue", placement: "secondary", run: (context) => context.openOverlay("Issue detail") },
        { id: "apply proposed fix", label: "Apply a proposed fix", placement: "overflow", run: (context) => context.openOverlay("code diff") },
        { id: "retest", label: "Retest", placement: "overflow", run: (context) => retestAudit(context) },
        { id: "export report", label: "Export the report", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("audit report") },
      ],
      overlays: [
        { id: "Issue detail", kind: "drawer", summary: siteSummary, title: "Check detail", width: 480, render: ({ ...context }) => <IssueDetail context={context} /> },
        { id: "code diff", kind: "drawer", summary: siteSummary, title: "Proposed change", width: 620, render: ({ ...context }) => <CodeDiffPanel context={context} /> },
        { id: "audit report", kind: "modal", summary: siteSummary, title: "Audit report", width: 560, render: ({ ...context }) => <AuditReport context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-WEB-009": {
      id: "ARL-WEB-009",
      title: () => "Domains & publishing",
      subtitle: () => "Publishing stops at the hosting boundary, and the export is the thing you can actually take away.",
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Domains", "Environments", "Deployments", "Logs"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <DeployConsole context={context} lens={lens} />,
      })),
      actions: [
        { id: "publish", label: "Publish", placement: "primary", run: (context) => context.openOverlay("Publish review", { environment: "production" }) },
        { id: "Verify domain", label: "Verify a domain", placement: "secondary", run: (context) => context.openOverlay("domain check") },
        { id: "rollback", label: "Roll back", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("rollback deployment") },
        { id: "inspect", label: "Inspect the latest deployment", placement: "overflow", run: (context) => context.openOverlay("deployment issue") },
        { id: "dns records", label: "DNS records", placement: "overflow", run: (context) => context.openOverlay("DNS instructions") },
      ],
      overlays: [
        { id: "Publish review", kind: "modal", title: "Publish review", width: 640, summary: ({ close: _close, ...context }) => <PublishSummary context={context} />, render: ({ close, ...context }) => <PublishReview context={context} close={close} /> },
        { id: "DNS instructions", kind: "drawer", summary: siteSummary, title: "DNS records", width: 560, render: ({ ...context }) => <DnsInstructions context={context} /> },
        { id: "deployment issue", kind: "modal", summary: siteSummary, title: "Deployment", width: 540, render: ({ ...context }) => <DeploymentIssue context={context} />, footer: closeFooter() },
        { id: "domain check", kind: "modal", summary: siteSummary, title: "Domain check", width: 560, render: ({ ...context }) => <DomainCheck context={context} />, footer: closeFooter() },
        {
          id: "domain attach", kind: "modal", summary: siteSummary, title: "Attach a domain", width: 520,
          render: ({ close, ...context }) => <DomainAttachForm context={context} close={close} />,
          footer: submitFooter("domain-attach", "Record the domain"),
        },
        rollbackDeployment,
      ],
    },

    "ARL-WEB-010": {
      id: "ARL-WEB-010",
      title: () => "Web analytics",
      subtitle: () => "What this browser can count is counted. What it cannot is left blank with the reason.",
      statusStrip: (context) => <SiteStatusStrip context={context} />,
      tabs: (["Traffic", "Conversion", "Events", "Content"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AnalyticsPanel context={context} lens={lens} />,
      })),
      actions: [
        { id: "Build chart", label: "Build a chart", placement: "primary", run: (context) => context.openOverlay("chart builder") },
        { id: "compare periods", label: "Compare periods", placement: "secondary", run: (context) => context.openOverlay("compare periods") },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => exportAnalytics(context) },
        { id: "inspect", label: "Inspect where a figure comes from", placement: "overflow", run: (context) => context.openOverlay("Metric source", { metric: "visits" }) },
        { id: "event setup", label: "Event setup", placement: "overflow", run: (context) => context.openOverlay("event setup") },
      ],
      overlays: [
        { id: "Metric source", kind: "drawer", summary: siteSummary, title: "Metric source", width: 520, render: ({ ...context }) => <MetricSource context={context} /> },
        { id: "event setup", kind: "modal", summary: siteSummary, title: "Event setup", width: 560, render: ({ ...context }) => <EventSetup context={context} />, footer: closeFooter() },
        { id: "attribution note", kind: "modal", summary: siteSummary, title: "Attribution", width: 520, render: ({ ...context }) => <AttributionNote context={context} />, footer: closeFooter() },
        { id: "chart builder", kind: "modal", summary: siteSummary, title: "Build a chart", width: 680, render: ({ ...context }) => <ChartBuilder context={context} />, footer: closeFooter() },
        { id: "compare periods", kind: "modal", summary: siteSummary, title: "Compare periods", width: 560, render: ({ ...context }) => <ComparePeriods context={context} />, footer: closeFooter() },
      ],
    },
  },
});

/* --------------------------- small overlay bodies --------------------------- */

function SiteSetupFormLazy({ context, close }: { context: ScreenContext; close: () => void }) {
  const { SiteSetupForm } = PANELS;
  return <SiteSetupForm context={context} close={close} />;
}

import * as PanelsModule from "./panels";
import { clockIso, wallMs } from "@/platform/clock";
const PANELS = { SiteSetupForm: PanelsModule.SiteSetupForm };

function SiteFieldEditor({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site } = useSiteRecord(context);
  const payload = context.overlayPayload as { formId?: string; fieldId?: string } | undefined;
  if (!record) return <NoSite />;
  const form = site.forms.find((item) => item.id === payload?.formId) ?? site.forms[0];
  if (!form) return <Empty title="Add a form first" icon={<ListOrdered size={20} />}>A field belongs to a site form.</Empty>;
  const field = form.fields.find((item) => item.id === payload?.fieldId);
  return (
    <form
      id="site-field"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const label = String(data.get("label") ?? "").trim();
        if (!label) return;
        const next = { id: field?.id ?? `ff-${wallMs().toString(36)}`, label, type: String(data.get("type") ?? "text"), required: data.get("required") === "on" };
        const fields = field ? form.fields.map((item) => (item.id === field.id ? next : item)) : [...form.fields, next];
        if (!(await saveSite(context, record, { ...site, forms: site.forms.map((item) => (item.id === form.id ? { ...item, fields } : item)) }, `Field ${label} saved on ${form.name}`))) return;
        context.toast("Field saved", `${label} is ${next.required ? "required" : "optional"} on ${form.name}.`);
        close();
      }}
    >
      <Field label="Label" required><TextInput name="label" defaultValue={field?.label ?? ""} required /></Field>
      <Field label="Type">
        <Select name="type" defaultValue={field?.type ?? "text"}>
          {["text", "email", "tel", "number", "date", "textarea"].map((type) => <option key={type} value={type}>{type}</option>)}
        </Select>
      </Field>
      <Checkbox name="required" label="Required" defaultChecked={field?.required ?? false} />
      <Notice tone="info">A required field is checked before a submission record is written, so an empty value never reaches the record.</Notice>
    </form>
  );
}

function ConsentInspector({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return <NoSite />;
  const form = site.forms[0];
  return (
    <Stack gap={4}>
      {form ? (
        <OverlaySection title={form.name} hint="The wording shown to the person is copied onto each submission, so a later reader sees what was agreed.">
          <FactGrid columns={2} items={[
            { label: "Consent line", value: form.consent },
            { label: "Stored with the submission", value: "Yes, the accepted wording is copied onto the record" },
            { label: "Spam control", value: form.honeypot ? "A hidden field is checked" : "None" },
          ]} />
        </OverlaySection>
      ) : (
        <Notice tone="warning" title="No site form yet">Add a form on the Forms tab to set its consent wording.</Notice>
      )}
      <Row gap={2}><Pill tone="warning">No cookie is set</Pill><Pill tone="warning">No tracker is loaded</Pill></Row>
    </Stack>
  );
}

function RoutingForm({ context, close }: { context: ScreenContext; close: () => void }) {
  const { record, site, forms } = useSiteRecord(context);
  const payload = context.overlayPayload as { id?: string } | undefined;
  if (!record) return <NoSite />;
  const form = site.forms.find((item) => item.id === payload?.id) ?? site.forms[0];
  if (!form) return <Empty title="No site form to route" icon={<ListOrdered size={20} />} />;
  return (
    <form
      id="site-routing"
      className="ds-stack ds-gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const next = {
          ...form,
          formRecordId: String(data.get("formRecordId") ?? form.formRecordId),
          route: (String(data.get("route") ?? "record") === "review" ? "review" : "record") as "review" | "record",
          webhook: String(data.get("webhook") ?? "").trim(),
          honeypot: data.get("honeypot") === "on",
        };
        if (!(await saveSite(context, record, { ...site, forms: site.forms.map((item) => (item.id === form.id ? next : item)) }, `Routing for ${form.name} saved`))) return;
        context.toast("Routing saved", next.route === "record" ? "A submission creates a record straight away." : "Submissions are held for review before a record is created.");
        close();
      }}
    >
      <Field label="Write submissions against">
        <Select name="formRecordId" defaultValue={form.formRecordId}>
          <option value="">Not bound</option>
          {forms.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </Select>
      </Field>
      <Field label="On submission">
        <Select name="route" defaultValue={form.route}>
          <option value="record">Create a submission record</option>
          <option value="review">Hold for review first</option>
        </Select>
      </Field>
      <Field label="Webhook address" hint="Stored with the site. Nothing is called from this browser.">
        <TextInput name="webhook" defaultValue={form.webhook} placeholder="https://example.com/hooks/enquiry" />
      </Field>
      <Checkbox name="honeypot" label="Check a hidden field to reject obvious spam" defaultChecked={form.honeypot} />
      <BoundaryNotice id="email.send" action="Forwarding a submission" />
    </form>
  );
}
