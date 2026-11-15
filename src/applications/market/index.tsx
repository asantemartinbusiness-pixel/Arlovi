import { CalendarDays, Images, LayoutTemplate, Mail, Megaphone, MousePointerClick, Search, Target, TrendingUp, Users } from "lucide-react";
import { Empty, Notice, Pill, Properties, Row, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useRecord } from "@/platform/workspace";
import { submitFooter } from "@/applications/market/kit";
import "@/applications/market/growth.css";
import { bodyOf, type CampaignBody } from "./data";
import {
  Advertising, Attribution, AudienceSegments, CampaignDetail, CampaignLibrary, ContentCalendar,
  EmailCampaigns, LandingPages, MarketTemplates, MarketingOverview, SeoContent, SocialPublishing,
} from "./panels";
import {
  AccountAuthorization, AdPreview, AttributionModelExplainer, AudiencePreview, AuditIssue,
  BudgetInspector, CampaignDiagnostics, CampaignTemplatePicker, CampaignWizard, ConsentInspector,
  CreativePreview, DeliveryReceipt, DuplicateRules, EmailBuilder, ExportPermission, GlobalUpdateImpact,
  LaunchApproval, MetricNotes, MetricSource, PageMetadataEditor, PageTemplatePicker, PauseConsequence,
  PlanApproval, PostComposer, PostEditor, PublishConfirm, PublishPreview, SegmentBuilder, SendReview,
  SourceInspector, SpendApproval, SuppressionCheck, TechnicalRecommendation, TemplateApproval,
  TemplateEditor, VersionCompare, AssetPicker,
} from "./overlays";

/* ====================================================================== *
 * MARKET — Marketing & Growth
 * Campaign planning, a real content calendar, audiences computed from the
 * workspace, and attribution that publishes its own uncertainty.
 * ====================================================================== */

const needsSelection = (context: ScreenContext) => (context.selectedId ? undefined : "Select a row first");

function campaignOf(context: ScreenContext) {
  return context.params.id;
}

export const marketApp = registerApp({
  code: "MARKET",
  short: "Marketing",
  name: "Marketing & Growth",
  purpose: "Plan, schedule and account for every campaign",
  icon: Megaphone,
  nav: [
    { items: [
      { label: "Marketing Overview", screenId: "ARL-MARKET-001", icon: TrendingUp },
      { label: "Campaign Library", screenId: "ARL-MARKET-002", icon: Megaphone },
    ] },
    { label: "Content", items: [
      { label: "Content Calendar", screenId: "ARL-MARKET-004", icon: CalendarDays },
      { label: "Social Publishing", screenId: "ARL-MARKET-005", icon: Images },
      { label: "Email Campaigns", screenId: "ARL-MARKET-006", icon: Mail },
      { label: "Landing Pages", screenId: "ARL-MARKET-010", icon: LayoutTemplate },
      { label: "Templates", screenId: "ARL-MARKET-012", icon: LayoutTemplate },
    ] },
    { label: "Reach", items: [
      { label: "Audience Segments", screenId: "ARL-MARKET-007", icon: Users },
      { label: "Advertising", screenId: "ARL-MARKET-008", icon: Target },
      { label: "SEO & Content", screenId: "ARL-MARKET-009", icon: Search },
    ] },
    { label: "Measurement", items: [
      { label: "Attribution", screenId: "ARL-MARKET-011", icon: MousePointerClick },
    ] },
  ],
  screens: {
    /* ------------------------------ 001 ------------------------------ */
    "ARL-MARKET-001": {
      id: "ARL-MARKET-001",
      subtitle: (context) => `Campaigns, spend and attribution for ${context.org.name}, computed from records in this browser.`,
      tabs: (["Overview", "Performance", "Calendar", "Opportunities"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <MarketingOverview context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create campaign", label: "Create campaign", placement: "primary", capability: "publish_campaign", run: (context) => context.openOverlay("campaign wizard") },
        { id: "inspect KPI", label: "Inspect a figure", placement: "secondary", run: (context) => context.openOverlay("Metric source", { metric: "revenue" }) },
        { id: "ask Marketing", label: "Ask Marketing", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/ai/chat`) },
        { id: "view alerts", label: "Opportunities", placement: "overflow", run: (context) => context.setTab("Opportunities") },
      ],
      overlays: [
        { id: "Metric source", kind: "drawer", title: "Where this figure comes from", width: 560, render: ({ ...context }) => <MetricSource context={context} /> },
        { id: "campaign wizard", kind: "modal", title: "New campaign", width: 620, render: ({ close, ...context }) => <CampaignWizard context={context} close={close} />, footer: submitFooter("campaign-wizard", "Create draft") },
        { id: "budget inspector", kind: "drawer", title: "Budget and reserve", width: 620, render: ({ ...context }) => <BudgetInspector context={context} /> },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-MARKET-002": {
      id: "ARL-MARKET-002",
      subtitle: () => "Every campaign with its owner, objective, channels and committed budget.",
      tabs: ["All", "Draft", "Approval", "Active", "Completed"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <CampaignLibrary context={context} state={state} />,
      })),
      actions: [
        { id: "Create", label: "New campaign", placement: "primary", capability: "publish_campaign", run: (context) => context.openOverlay("campaign wizard") },
        { id: "duplicate", label: "Duplicate", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("duplicate rules", { id: context.selectedId }) },
        { id: "archive", label: "Archive", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => context.openOverlay("plan approval", { id: context.selectedId }) },
        { id: "compare", label: "Compare performance", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/market/analytics`) },
        { id: "From a template", label: "Start from a template", placement: "overflow", run: (context) => context.openOverlay("Campaign template") },
      ],
      overlays: [
        { id: "Campaign template", kind: "modal", title: "Start from a plan template", width: 560, render: ({ close, ...context }) => <CampaignTemplatePicker context={context} close={close} />, footer: submitFooter("campaign-template", "Create draft") },
        { id: "plan approval", kind: "modal", title: "Plan approval", width: 560, render: ({ close, ...context }) => <PlanApproval context={context} close={close} />, footer: submitFooter("plan-approval", "Record approval") },
        { id: "duplicate rules", kind: "modal", title: "What a copy inherits", width: 560, render: ({ close, ...context }) => <DuplicateRules context={context} close={close} /> },
        { id: "campaign wizard", kind: "modal", title: "New campaign", width: 620, render: ({ close, ...context }) => <CampaignWizard context={context} close={close} />, footer: submitFooter("campaign-wizard", "Create draft") },
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-MARKET-003": {
      id: "ARL-MARKET-003",
      title: () => "Campaign",
      subtitle: () => "Objectives, audience, creative, channel plan and the budget committed against it.",
      tabs: ["Overview", "Plan", "Assets", "Channels", "Results", "Activity"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CampaignDetail context={context} lens={lens} />,
      })),
      statusStrip: () => (
        <Row gap={2} wrap>
          <Pill tone="warning" dot>Delivery not connected</Pill>
          <span className="ds-subtle">Scheduling, approvals and spend are records in this browser. Nothing is sent to an advertising or mail provider.</span>
        </Row>
      ),
      actions: [
        { id: "approve", label: "Approve plan", placement: "primary", capability: "publish_campaign", run: (context) => context.openOverlay("launch approval") },
        { id: "launch", label: "Launch locally", placement: "primary", capability: "publish_campaign", run: (context) => context.openOverlay("launch approval") },
        { id: "Edit draft", label: "Edit brief", placement: "secondary", run: (context) => context.openOverlay("email builder", { id: campaignOf(context) }) },
        { id: "pause", label: "Pause", placement: "secondary", tone: "danger", run: (context) => context.openOverlay("pause consequence") },
        { id: "request review", label: "Request review", placement: "overflow", run: async (context) => {
          await context.mutate.log(`Review requested for campaign ${context.params.id}`, { entityId: context.params.id, type: "review.requested" });
          context.toast("Review requested", "The request is recorded on the campaign's activity. No notification was sent.");
        } },
      ],
      overlays: [
        { id: "Creative preview", kind: "drawer", title: "Creative preview", width: 520, render: ({ ...context }) => <CreativePreview context={context} /> },
        { id: "launch approval", kind: "modal", title: "Launch approval", width: 560, render: ({ close, ...context }) => <LaunchApproval context={context} close={close} />, footer: submitFooter("launch-approval", "Record launch") },
        { id: "pause consequence", kind: "modal", title: "What pausing does", tone: "danger", width: 560, render: ({ close, ...context }) => <PauseConsequence context={context} close={close} /> },
        { id: "email builder", kind: "modal", title: "Campaign brief and email", width: 620, render: ({ close, ...context }) => <EmailBuilder context={context} close={close} />, footer: submitFooter("email-builder", "Save draft") },
        { id: "Metric source", kind: "drawer", title: "Where this figure comes from", width: 560, render: ({ ...context }) => <MetricSource context={context} /> },
      ],
      inspector: (context) => <CampaignInspector context={context} />,
      inspectorTitle: "Campaign facts",
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-MARKET-004": {
      id: "ARL-MARKET-004",
      subtitle: (context) => `Scheduled content in ${context.org.timezone}. Drag an item, or focus one and press Enter to move it with the arrow keys.`,
      tabs: ["Month", "Week", "List", "By channel"].map((view) => ({
        id: view,
        render: (context: ScreenContext) => <ContentCalendar context={context} view={view} />,
      })),
      actions: [
        { id: "publish", label: "Review and queue", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("publish preview", { id: context.selectedId }) },
        { id: "preview", label: "Preview", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("publish preview", { id: context.selectedId }) },
        { id: "Drag schedule", label: "Reschedule selected", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("Post editor", { id: context.selectedId }) },
        { id: "edit caption", label: "Edit caption", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("Post editor", { id: context.selectedId }) },
        { id: "attach media", label: "Attach media", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("asset picker", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Post editor", kind: "modal", title: "Scheduled item", width: 620, render: ({ close, ...context }) => <PostEditor context={context} close={close} />, footer: submitFooter("post-editor", "Save schedule") },
        { id: "asset picker", kind: "modal", title: "Attach media", width: 560, render: ({ close, ...context }) => <AssetPicker context={context} close={close} /> },
        { id: "publish preview", kind: "drawer", title: "Publish preview", width: 560, render: ({ close, ...context }) => <PublishPreview context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-MARKET-005": {
      id: "ARL-MARKET-005",
      subtitle: () => "Drafts, local queue and the honest state of every item that was meant to go out.",
      tabs: ["Drafts", "Schedule", "Published", "Failed"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <SocialPublishing context={context} state={state} />,
      })),
      actions: [
        { id: "create post", label: "New post", placement: "primary", run: (context) => context.openOverlay("post composer") },
        { id: "Connect account", label: "Connect an account", placement: "secondary", capability: "manage_connectors", run: (context) => context.openOverlay("Account authorization") },
        { id: "schedule", label: "Schedule selected", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("post composer", { id: context.selectedId }) },
        { id: "retry safely", label: "Delivery receipt", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("delivery receipt", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Account authorization", kind: "modal", title: "Connect an account", width: 560, render: ({ close, ...context }) => <AccountAuthorization context={context} close={close} />, footer: submitFooter("account-auth", "Record the request") },
        { id: "post composer", kind: "drawer", title: "Composer", width: 640, render: ({ close, ...context }) => <PostComposer context={context} close={close} />, footer: submitFooter("post-composer", "Save draft") },
        { id: "delivery receipt", kind: "modal", title: "Delivery receipt", width: 560, render: ({ ...context }) => <DeliveryReceipt context={context} /> },
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-MARKET-006": {
      id: "ARL-MARKET-006",
      subtitle: () => "Build the email, check who would receive it, and see why nothing can be sent yet.",
      tabs: ["Campaigns", "Templates", "Audiences", "Reports"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <EmailCampaigns context={context} lens={lens} />,
      })),
      actions: [
        { id: "Build email", label: "Build an email", placement: "primary", run: (context) => context.openOverlay("email builder") },
        { id: "approve recipients", label: "Approve recipients", placement: "secondary", capability: "publish_campaign", run: (context) => context.openOverlay("send review", { id: context.selectedId, mode: "approve" }) },
        { id: "test send", label: "Test send", placement: "secondary", run: (context) => context.openOverlay("send review", { id: context.selectedId, mode: "test" }) },
        { id: "schedule", label: "Set the send window", placement: "overflow", run: (context) => context.openOverlay("email builder", { id: context.selectedId }) },
        { id: "suppression", label: "Suppression check", placement: "overflow", run: (context) => context.openOverlay("suppression check") },
      ],
      overlays: [
        { id: "Audience preview", kind: "drawer", title: "Audience preview", width: 620, render: ({ ...context }) => <AudiencePreview context={context} /> },
        { id: "send review", kind: "modal", title: "Send review", width: 620, render: ({ close, ...context }) => <SendReview context={context} close={close} />, footer: submitFooter("send-review", "Record recipients") },
        { id: "suppression check", kind: "drawer", title: "Suppression check", width: 620, render: () => <SuppressionCheck /> },
        { id: "email builder", kind: "drawer", title: "Email builder", width: 640, render: ({ close, ...context }) => <EmailBuilder context={context} close={close} />, footer: submitFooter("email-builder", "Save draft") },
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-MARKET-007": {
      id: "ARL-MARKET-007",
      subtitle: (context) => `Segments are evaluated against the contact records in ${context.org.shortName} every time this screen renders.`,
      tabs: ["Segments", "Contacts", "Exclusions", "Sources"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <AudienceSegments context={context} lens={lens} />,
      })),
      actions: [
        { id: "Build segment", label: "Build a segment", placement: "primary", run: (context) => context.openOverlay("Segment builder") },
        { id: "preview", label: "Preview members", placement: "secondary", run: (context) => context.openOverlay("Audience preview", { id: context.selectedId }) },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export permission", { id: context.selectedId }) },
        { id: "set exclusion", label: "Set exclusions", placement: "overflow", run: (context) => context.openOverlay("Segment builder", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Segment builder", kind: "drawer", title: "Segment builder", width: 680, render: ({ close, ...context }) => <SegmentBuilder context={context} close={close} />, footer: submitFooter("segment-builder", "Save segment") },
        { id: "consent inspector", kind: "drawer", title: "Consent", width: 520, render: ({ ...context }) => <ConsentInspector context={context} /> },
        { id: "export permission", kind: "modal", title: "Export contacts", width: 560, render: ({ close, ...context }) => <ExportPermission context={context} close={close} /> },
        { id: "Audience preview", kind: "drawer", title: "Audience preview", width: 620, render: ({ ...context }) => <AudiencePreview context={context} /> },
      ],
    },

    /* ------------------------------ 008 ------------------------------ */
    "ARL-MARKET-008": {
      id: "ARL-MARKET-008",
      subtitle: () => "Paid plans, local budgets and the reserve held against spend a provider would report late.",
      tabs: ["Accounts", "Campaigns", "Creative", "Spend", "Exceptions"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Advertising context={context} lens={lens} />,
      })),
      actions: [
        { id: "Build draft", label: "New paid campaign", placement: "primary", capability: "publish_campaign", run: (context) => context.openOverlay("campaign wizard") },
        { id: "change allocation", label: "Change allocation", placement: "secondary", run: (context) => context.openOverlay("spend approval", { id: context.selectedId }) },
        { id: "pause", label: "Pause selected", placement: "overflow", tone: "danger", guard: needsSelection, run: async (context) => {
          const id = context.selectedId!;
          await context.mutate.patch(id, { status: "paused" }, { event: "Campaign paused from Advertising" });
          context.toast("Paused locally", "The campaign is paused in this workspace. No provider spend could be stopped, because none was ever authorised from here.");
        } },
        { id: "reconcile", label: "Diagnose", placement: "overflow", run: (context) => context.openOverlay("campaign diagnostics", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Ad preview", kind: "drawer", title: "Ad preview", width: 560, render: ({ ...context }) => <AdPreview context={context} /> },
        { id: "spend approval", kind: "modal", title: "Allocation and reserve", width: 600, render: ({ close, ...context }) => <SpendApproval context={context} close={close} />, footer: submitFooter("spend-approval", "Save allocation") },
        { id: "campaign diagnostics", kind: "drawer", title: "Diagnostics", width: 560, render: ({ ...context }) => <CampaignDiagnostics context={context} /> },
        { id: "campaign wizard", kind: "modal", title: "New campaign", width: 620, render: ({ close, ...context }) => <CampaignWizard context={context} close={close} />, footer: submitFooter("campaign-wizard", "Create draft") },
        { id: "Account authorization", kind: "modal", title: "Connect an ad account", width: 560, render: ({ close, ...context }) => <AccountAuthorization context={context} close={close} />, footer: submitFooter("account-auth", "Record the request") },
      ],
    },

    /* ------------------------------ 009 ------------------------------ */
    "ARL-MARKET-009": {
      id: "ARL-MARKET-009",
      subtitle: () => "An audit of the page model saved in this browser, with no promise about rankings.",
      tabs: ["Audit", "Content", "Keywords", "Technical"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SeoContent context={context} lens={lens} />,
      })),
      actions: [
        { id: "Run audit", label: "Re-read the page model", placement: "primary", run: async (context) => {
          await context.mutate.log("SEO audit re-read the saved page model in this browser.", { type: "audit.local", capability: "ready_local" });
          context.toast("Audit re-read", "The issues come from the page records saved here. No site was crawled, because no crawler is connected.");
        } },
        { id: "assign issue", label: "Assign an issue", placement: "secondary", run: (context) => context.openOverlay("Audit issue") },
        { id: "edit metadata", label: "Edit metadata", placement: "secondary", run: (context) => context.openOverlay("page editor") },
        { id: "publish", label: "Open landing pages", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/market/pages`) },
      ],
      overlays: [
        { id: "Audit issue", kind: "modal", title: "Audit issue", width: 600, render: ({ close, ...context }) => <AuditIssue context={context} close={close} />, footer: submitFooter("audit-issue", "Save owner") },
        { id: "page editor", kind: "modal", title: "Page metadata", width: 600, render: ({ close, ...context }) => <PageMetadataEditor context={context} close={close} />, footer: submitFooter("page-metadata", "Save metadata") },
        { id: "technical recommendation", kind: "drawer", title: "Recommendation", width: 540, render: ({ ...context }) => <TechnicalRecommendation context={context} /> },
      ],
    },

    /* ------------------------------ 010 ------------------------------ */
    "ARL-MARKET-010": {
      id: "ARL-MARKET-010",
      subtitle: () => "Pages are block records. They export as HTML from this browser; no hosting is connected.",
      tabs: ["Library", "Builder", "Tests", "Analytics"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <LandingPages context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create", label: "New page", placement: "primary", run: (context) => context.openOverlay("Page template") },
        { id: "publish", label: "Export version", placement: "primary", run: (context) => context.openOverlay("publish confirm", { id: context.selectedId }) },
        { id: "visually edit", label: "Open the builder", placement: "secondary", run: (context) => context.setTab("Builder") },
        { id: "test", label: "Tests", placement: "overflow", run: (context) => context.setTab("Tests") },
        { id: "revert", label: "Versions", placement: "overflow", run: (context) => context.openOverlay("version compare", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Page template", kind: "modal", title: "New landing page", width: 600, render: ({ close, ...context }) => <PageTemplatePicker context={context} close={close} />, footer: submitFooter("page-template", "Create page") },
        { id: "publish confirm", kind: "modal", title: "Export this page", width: 560, render: ({ close, ...context }) => <PublishConfirm context={context} close={close} /> },
        { id: "version compare", kind: "drawer", title: "Versions", width: 620, render: ({ ...context }) => <VersionCompare context={context} /> },
      ],
    },

    /* ------------------------------ 011 ------------------------------ */
    "ARL-MARKET-011": {
      id: "ARL-MARKET-011",
      subtitle: () => "Which channel gets the credit is a choice of model. The unattributed share is published, not hidden.",
      tabs: ["Channels", "Funnels", "Revenue", "Cohorts", "Models"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Attribution context={context} lens={lens} />,
      })),
      actions: [
        { id: "compare", label: "Compare models", placement: "primary", run: (context) => context.setTab("Models") },
        { id: "Filter", label: "Revenue view", placement: "secondary", run: (context) => context.setTab("Revenue") },
        { id: "drill down", label: "Inspect a source", placement: "overflow", run: (context) => context.openOverlay("source inspector", { metric: "orders" }) },
        { id: "export", label: "Export channel table", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("metric notes") },
      ],
      overlays: [
        { id: "Attribution model", kind: "modal", title: "About this model", width: 560, render: ({ ...context }) => <AttributionModelExplainer context={context} /> },
        { id: "source inspector", kind: "drawer", title: "Source", width: 620, render: ({ ...context }) => <SourceInspector context={context} /> },
        { id: "metric notes", kind: "drawer", title: "Metric notes", width: 560, render: ({ ...context }) => <MetricNotes context={context} /> },
      ],
    },

    /* ------------------------------ 012 ------------------------------ */
    "ARL-MARKET-012": {
      id: "ARL-MARKET-012",
      subtitle: () => "Brand-approved emails, posts, ads, plans and pages. A new version never rewrites something already live.",
      tabs: ["All", "Saved", "Approved", "Archived"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <MarketTemplates context={context} state={state} />,
      })),
      actions: [
        { id: "Create", label: "New template", placement: "primary", run: (context) => context.openOverlay("Template editor") },
        { id: "fork", label: "Fork", placement: "secondary", guard: needsSelection, run: async (context) => {
          const id = context.selectedId!;
          context.openOverlay("Template editor", { id });
        } },
        { id: "review", label: "Review", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("approval", { id: context.selectedId }) },
        { id: "publish", label: "Impact of a change", placement: "overflow", guard: needsSelection, run: (context) => context.openOverlay("global update impact", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Template editor", kind: "drawer", title: "Template", width: 600, render: ({ close, ...context }) => <TemplateEditor context={context} close={close} />, footer: submitFooter("template-editor", "Save version") },
        { id: "approval", kind: "modal", title: "Template approval", width: 560, render: ({ close, ...context }) => <TemplateApproval context={context} close={close} />, footer: submitFooter("template-approval", "Approve template") },
        { id: "global update impact", kind: "drawer", title: "What a change affects", width: 620, render: ({ ...context }) => <GlobalUpdateImpact context={context} /> },
      ],
    },
  },
});

function CampaignInspector({ context }: { context: ScreenContext }) {
  const campaign = useRecord(context.params.id);
  if (!campaign) return <Empty title="No campaign" >Open a campaign from the library to see its facts here.</Empty>;
  const channels = bodyOf<CampaignBody>(campaign, {}).channels ?? [];
  const committed = channels.reduce((sum, channel) => sum + channel.spentMinor, 0);
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Record", value: <code>{campaign.id}</code> },
        { label: "Owner", value: campaign.ownerName },
        { label: "Objective", value: String(campaign.fields.objective ?? "Not set") },
        { label: "Approval", value: <Pill tone={String(campaign.fields.approval) === "approved" ? "success" : "warning"}>{String(campaign.fields.approval ?? "draft").replace("_", " ")}</Pill> },
        { label: "Committed", value: context.money(committed) },
        { label: "Channels", value: channels.map((channel) => channel.network).join(", ") || "None" },
        { label: "Revision", value: String(campaign.revision) },
        { label: "Last change", value: context.relative(campaign.updatedAt) },
      ]} />
      <Notice tone="info" title="Figures on this screen">
        Impressions, clicks, conversions and claimed revenue are fields on this record. They were typed here, not measured by a platform, and the Results tab says so beside each one.
      </Notice>
    </Stack>
  );
}
