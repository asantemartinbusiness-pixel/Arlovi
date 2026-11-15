import {
  Building2, CalendarClock, FileSignature, Inbox, Kanban, LineChart, Target, UserRound, Workflow,
} from "lucide-react";
import { Button, Empty } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import {
  CampaignsPanel, CrmMetricDrilldown, CrmOverview, CrmOverviewStrip, InsightCard, MyPipeline, NewLead, TeamOverview,
} from "./overview";
import {
  ActivityComposer, BulkActionConfirmation, ComposeMessage, ContactDeals, ContactFiles, ContactForm, ContactHeader,
  ContactInspector, ContactOverview, ContactService, ContactTimeline, ContactsTable, MergePreview,
} from "./contacts";
import {
  AccountEditor, CompaniesTable, CompanyMergePreview, ConvertDialog, LeadsBoard, LeadsStrip, QualificationInspector,
  RelationshipInspector, RoutingRulesOverlay,
} from "./companies";
import {
  DealDrawer, LostReason, PipelineBoard, PipelineForecast, PipelineList, PipelineStrip, PipelineTeam, StageChangeValidation,
} from "./pipeline";
import {
  ClosureConfirmation, CollaboratorPicker, DealActivity, DealDocuments, DealHeader, DealInspector, DealOverview,
  DealProducts, DealTeam, RequestApproval,
} from "./deal";
import { PricingPolicy, QuoteEditor, QuotesList, QuotesStrip, SendPreview } from "./quotes";
import {
  ActivationApproval, ActivityEntry, ActivityHistory, AllActivity, AutomationStrip, CalendarConflict,
  ConfidenceExplanation, FailuresTab, FollowUps, ForecastCurrent, ForecastHistory, ForecastMethodology, ForecastModel,
  ForecastScenarios, ForecastStrip, MeetingComposer, MyCalendar, OverrideReason, RunsTab, TemplatesTab, TestData,
  WorkflowDesigner, WorkflowsTab,
} from "./activity";

/* ====================================================================== *
 * CRM — Customer relationships and sales
 *
 * The pipeline is a board you can move with a pointer or the keyboard, and
 * every move runs the same stage validation. A deal that converts writes real
 * linked records: a quote, and an invoice in Finance priced through the same
 * tax engine as any other document.
 * ====================================================================== */

function NotBuilt({ context }: { context: ScreenContext }) {
  return (
    <Empty
      title={`${context.screen.title} is not implemented in CRM yet`}
      action={<Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/crm/home`)}>Back to the overview</Button>}
    />
  );
}

export const crmApp = registerApp({
  code: "CRM",
  short: "CRM",
  name: "CRM & Sales",
  purpose: "Relationships, pipeline and quotes, with the evidence behind each stage",
  icon: Target,
  nav: [
    { items: [
      { label: "CRM Overview", screenId: "ARL-CRM-001", icon: LineChart },
      { label: "Deals Pipeline", screenId: "ARL-CRM-006", icon: Kanban },
    ] },
    { label: "Records", items: [
      { label: "Contacts", screenId: "ARL-CRM-002", icon: UserRound },
      { label: "Companies", screenId: "ARL-CRM-004", icon: Building2 },
      { label: "Leads & Qualification", screenId: "ARL-CRM-005", icon: Inbox },
    ] },
    { label: "Selling", items: [
      { label: "Quotes & Proposals", screenId: "ARL-CRM-008", icon: FileSignature },
      { label: "Activities", screenId: "ARL-CRM-009", icon: CalendarClock },
      { label: "Sales Forecasts", screenId: "ARL-CRM-010", icon: LineChart },
    ] },
    { label: "Operations", items: [
      { label: "Sales Automation", screenId: "ARL-CRM-011", icon: Workflow },
    ] },
  ],

  screens: {
    /* --------------------------- CRM-001 --------------------------- */
    "ARL-CRM-001": {
      id: "ARL-CRM-001",
      subtitle: (context) => `Pipeline, conversion and what has gone quiet in ${context.org.name}. Forecast figures are predictions, not revenue.`,
      statusStrip: (context) => <CrmOverviewStrip context={context} />,
      tabs: [
        { id: "Overview", render: (context) => <CrmOverview context={context} /> },
        { id: "My pipeline", render: (context) => <MyPipeline context={context} /> },
        { id: "Team", render: (context) => <TeamOverview context={context} /> },
        { id: "Forecast", render: (context) => <ForecastCurrent context={context} /> },
      ],
      actions: [
        { id: "Open deal", label: "Open the pipeline", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/crm/deals`) },
        { id: "assign follow-up", label: "New lead", placement: "secondary", run: (context) => context.openOverlay("new lead") },
        { id: "inspect conversion", label: "Inspect a figure", placement: "secondary", run: (context) => context.openOverlay("Metric drilldown", { metric: "pipeline" }) },
        { id: "ask Sales", label: "Notes worth acting on", placement: "overflow", run: (context) => context.openOverlay("insight card") },
      ],
      overlays: [
        { id: "Metric drilldown", kind: "drawer", title: "Where this figure comes from", width: 720, render: ({ ...context }) => <CrmMetricDrilldown context={context} /> },
        { id: "new lead", kind: "modal", title: "New lead", width: 640, render: ({ close, ...context }) => <NewLead context={context} close={close} /> },
        { id: "insight card", kind: "drawer", title: "Notes from the records", width: 600, render: ({ ...context }) => <InsightCard context={context} /> },
      ],
    },

    /* --------------------------- CRM-002 --------------------------- */
    "ARL-CRM-002": {
      id: "ARL-CRM-002",
      subtitle: () => "People, who owns them, and the consent that decides whether anything may be sent.",
      tabs: ["All", "My contacts", "Segments", "Duplicates"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <ContactsTable context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create", label: "New contact", placement: "primary", run: (context) => context.openOverlay("Contact form") },
        { id: "open", label: "Open", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a contact first"), run: (context) => context.navigate(`/o/${context.org.slug}/crm/contacts/${context.selectedId}`) },
        { id: "merge reviewed", label: "Review duplicates", placement: "secondary", run: (context) => context.setTab("Duplicates") },
        { id: "tag", label: "Tag a selection", placement: "overflow", run: (context) => context.openOverlay("bulk action confirmation") },
        { id: "export", label: "Export", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("bulk action confirmation", { export: true }) },
      ],
      overlays: [
        { id: "Contact form", kind: "modal", title: "Contact", width: 680, render: ({ close, ...context }) => <ContactForm context={context} close={close} /> },
        { id: "merge preview", kind: "drawer", title: "Merge two contacts", width: 760, render: ({ close, ...context }) => <MergePreview context={context} close={close} /> },
        { id: "bulk action confirmation", kind: "modal", title: "Tag a selection", width: 560, render: ({ close, ...context }) => <BulkActionConfirmation context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-003 --------------------------- */
    "ARL-CRM-003": {
      id: "ARL-CRM-003",
      title: () => "Contact",
      header: (context) => <ContactHeader context={context} />,
      inspectorTitle: "Contact",
      inspector: (context) => <ContactInspector context={context} />,
      tabs: [
        { id: "Overview", render: (context) => <ContactOverview context={context} /> },
        { id: "Timeline", render: (context) => <ContactTimeline context={context} /> },
        { id: "Deals", render: (context) => <ContactDeals context={context} /> },
        { id: "Service", render: (context) => <ContactService context={context} /> },
        { id: "Files", render: (context) => <ContactFiles context={context} /> },
      ],
      actions: [
        { id: "add note", label: "Log an activity", placement: "primary", run: (context) => context.openOverlay("activity composer") },
        { id: "Message", label: "Draft a message", placement: "secondary", run: (context) => context.openOverlay("Compose message") },
        { id: "schedule", label: "Schedule a meeting", placement: "secondary", run: (context) => context.openOverlay("activity composer", { kind: "meeting" }) },
        { id: "attach record", label: "Edit the contact", placement: "overflow", run: (context) => context.openOverlay("Contact form", { id: context.params.id }) },
      ],
      overlays: [
        { id: "Compose message", kind: "modal", title: "Draft a message", width: 640, render: ({ close, ...context }) => <ComposeMessage context={context} close={close} /> },
        { id: "activity composer", kind: "modal", title: "Log an activity", width: 640, render: ({ close, ...context }) => <ActivityComposer context={context} close={close} /> },
        { id: "customer merge", kind: "drawer", title: "Merge this contact", width: 760, render: ({ close, ...context }) => <MergePreview context={context} close={close} /> },
        { id: "Contact form", kind: "modal", title: "Contact", width: 680, render: ({ close, ...context }) => <ContactForm context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-004 --------------------------- */
    "ARL-CRM-004": {
      id: "ARL-CRM-004",
      subtitle: () => "Accounts with their contacts, deals and the invoices behind them.",
      tabs: ["All", "Active", "Prospects", "Archived"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <CompaniesTable context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create account", label: "New account", placement: "primary", run: (context) => context.openOverlay("Account editor") },
        { id: "link contact", label: "Relationships", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select an account first"), run: (context) => context.openOverlay("relationship inspector", { id: context.selectedId }) },
        { id: "search", label: "Merge two accounts", placement: "overflow", run: (context) => context.openOverlay("merge preview") },
        { id: "export", label: "Campaign links", placement: "overflow", run: (context) => context.openOverlay("relationship inspector", { campaigns: true }) },
      ],
      overlays: [
        { id: "Account editor", kind: "modal", title: "Account", width: 640, render: ({ close, ...context }) => <AccountEditor context={context} close={close} /> },
        { id: "relationship inspector", kind: "drawer", title: "Relationships", width: 720, render: ({ ...context }) => <><RelationshipInspector context={context} /><CampaignsPanel context={context} /></> },
        { id: "merge preview", kind: "drawer", title: "Merge two accounts", width: 720, render: ({ close, ...context }) => <CompanyMergePreview context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-005 --------------------------- */
    "ARL-CRM-005": {
      id: "ARL-CRM-005",
      subtitle: () => "Incoming enquiries with a score you can argue with, and conversion that writes a real deal.",
      statusStrip: (context) => <LeadsStrip context={context} />,
      tabs: ["Inbox", "Qualified", "Disqualified", "Rules"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <LeadsBoard context={context} tab={tab} />,
      })),
      actions: [
        { id: "qualify", label: "Qualify", placement: "primary", capability: "edit_pipeline", guard: (context) => (context.selectedId ? undefined : "Select a lead first"), run: (context) => context.openOverlay("Qualification inspector", { id: context.selectedId }) },
        { id: "convert", label: "Convert to a deal", placement: "secondary", capability: "edit_pipeline", guard: (context) => (context.selectedId ? undefined : "Select a lead first"), run: (context) => context.openOverlay("convert dialog", { id: context.selectedId }) },
        { id: "Assign lead", label: "Routing and owners", placement: "secondary", run: (context) => context.openOverlay("routing rules") },
        { id: "bulk route", label: "Routing rules", placement: "overflow", run: (context) => context.openOverlay("routing rules") },
      ],
      overlays: [
        { id: "Qualification inspector", kind: "drawer", title: "Qualify a lead", width: 680, render: ({ close, ...context }) => <QualificationInspector context={context} close={close} /> },
        { id: "convert dialog", kind: "modal", title: "Convert to a deal", width: 640, render: ({ close, ...context }) => <ConvertDialog context={context} close={close} /> },
        { id: "routing rules", kind: "drawer", title: "Routing rules", width: 760, render: ({ ...context }) => <RoutingRulesOverlay context={context} /> },
      ],
    },

    /* --------------------------- CRM-006 --------------------------- */
    "ARL-CRM-006": {
      id: "ARL-CRM-006",
      subtitle: () => "Drag a card with a pointer or move it with the keyboard. Both run the same stage validation.",
      statusStrip: (context) => <PipelineStrip context={context} />,
      tabs: [
        { id: "Board", render: (context) => <PipelineBoard context={context} /> },
        { id: "List", render: (context) => <PipelineList context={context} /> },
        { id: "Forecast", render: (context) => <PipelineForecast context={context} /> },
        { id: "Team", render: (context) => <PipelineTeam context={context} /> },
      ],
      actions: [
        { id: "Move stage", label: "Validate a stage change", placement: "primary", capability: "edit_pipeline", guard: (context) => (context.selectedId ? undefined : "Select a deal first"), run: (context) => context.openOverlay("stage change validation") },
        { id: "update amount", label: "New deal", placement: "secondary", capability: "edit_pipeline", run: (context) => context.openOverlay("Deal drawer") },
        { id: "create quote", label: "Build a quote", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a deal first"), run: (context) => context.navigate(`/o/${context.org.slug}/crm/deals/${context.selectedId}?tab=Products`) },
        { id: "assign owner", label: "Close lost", placement: "overflow", tone: "danger", guard: (context) => (context.selectedId ? undefined : "Select a deal first"), run: (context) => context.openOverlay("lost reason", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Deal drawer", kind: "drawer", title: "Deal", width: 640, render: ({ close, ...context }) => <DealDrawer context={context} close={close} /> },
        { id: "stage change validation", kind: "modal", title: "Stage change", width: 620, render: ({ close, ...context }) => <StageChangeValidation context={context} close={close} /> },
        { id: "lost reason", kind: "modal", title: "Close the deal as lost", width: 560, tone: "danger", render: ({ close, ...context }) => <LostReason context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-007 --------------------------- */
    "ARL-CRM-007": {
      id: "ARL-CRM-007",
      title: () => "Deal",
      header: (context) => <DealHeader context={context} />,
      inspectorTitle: "Deal",
      inspector: (context) => <DealInspector context={context} />,
      tabs: [
        { id: "Overview", render: (context) => <DealOverview context={context} /> },
        { id: "Activity", render: (context) => <DealActivity context={context} /> },
        { id: "Products", render: (context) => <DealProducts context={context} /> },
        { id: "Documents", render: (context) => <DealDocuments context={context} /> },
        { id: "Team", render: (context) => <DealTeam context={context} /> },
      ],
      actions: [
        { id: "close", label: "Close the deal", placement: "primary", capability: "edit_pipeline", run: (context) => context.openOverlay("closure confirmation") },
        { id: "Update stage", label: "Pipeline board", placement: "secondary", capability: "edit_pipeline", run: (context) => context.navigate(`/o/${context.org.slug}/crm/deals`) },
        { id: "create proposal", label: "Quote builder", placement: "secondary", run: (context) => context.openOverlay("Quote builder", { dealId: context.params.id }) },
        { id: "request approval", label: "Request an approval", placement: "overflow", run: (context) => context.openOverlay("collaborator picker", { approval: true }) },
      ],
      overlays: [
        { id: "Quote builder", kind: "drawer", title: "Quote builder", width: 1040, render: ({ close, ...context }) => <QuoteEditor context={context} close={close} /> },
        { id: "collaborator picker", kind: "drawer", title: "People and approvals", width: 620, render: ({ close, ...context }) => <><CollaboratorPicker context={context} close={close} /><RequestApproval context={context} close={close} /></> },
        { id: "closure confirmation", kind: "modal", title: "Close the deal", width: 680, render: ({ close, ...context }) => <ClosureConfirmation context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-008 --------------------------- */
    "ARL-CRM-008": {
      id: "ARL-CRM-008",
      subtitle: (context) => `Priced through the same tax engine as an invoice: ${context.org.jurisdiction} rules, one resolved code per line.`,
      statusStrip: (context) => <QuotesStrip context={context} />,
      tabs: ["Draft", "Review", "Sent", "Accepted", "Expired"].map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <QuotesList context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create", label: "New quote", placement: "primary", run: (context) => context.openOverlay("Quote editor") },
        { id: "edit", label: "Open", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a quote first"), run: (context) => context.openOverlay("Quote editor", { id: context.selectedId }) },
        { id: "send", label: "Send", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a quote first"), run: (context) => context.openOverlay("send preview", { id: context.selectedId }) },
        { id: "approve", label: "Pricing policy", placement: "overflow", run: (context) => context.openOverlay("pricing policy") },
        { id: "duplicate", label: "Duplicate for re-pricing", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a quote first"), run: (context) => context.openOverlay("Quote editor", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Quote editor", kind: "drawer", title: "Quote", width: 1040, render: ({ close, ...context }) => <QuoteEditor context={context} close={close} /> },
        { id: "pricing policy", kind: "drawer", title: "Pricing policy", width: 640, render: ({ ...context }) => <PricingPolicy context={context} /> },
        { id: "send preview", kind: "modal", title: "Send a quote", width: 660, render: ({ close, ...context }) => <SendPreview context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-009 --------------------------- */
    "ARL-CRM-009": {
      id: "ARL-CRM-009",
      subtitle: (context) => `Calls, meetings, drafts and tasks for ${context.actor}. Nothing is invited anywhere: no calendar is connected.`,
      tabs: [
        { id: "My calendar", render: (context) => <MyCalendar context={context} /> },
        { id: "All activity", render: (context) => <AllActivity context={context} /> },
        { id: "Follow-ups", render: (context) => <FollowUps context={context} /> },
        { id: "History", render: (context) => <ActivityHistory context={context} /> },
      ],
      actions: [
        { id: "Log call", label: "Log an activity", placement: "primary", run: (context) => context.openOverlay("Activity entry") },
        { id: "schedule meeting", label: "Schedule a meeting", placement: "secondary", run: (context) => context.openOverlay("meeting composer") },
        { id: "add reminder", label: "Check for overlaps", placement: "secondary", run: (context) => context.openOverlay("calendar conflict") },
        { id: "complete task", label: "Follow-ups", placement: "overflow", run: (context) => context.setTab("Follow-ups") },
      ],
      overlays: [
        { id: "Activity entry", kind: "modal", title: "Activity", width: 660, render: ({ close, ...context }) => <ActivityEntry context={context} close={close} /> },
        { id: "calendar conflict", kind: "drawer", title: "Overlaps in your diary", width: 560, render: ({ ...context }) => <CalendarConflict context={context} /> },
        { id: "meeting composer", kind: "modal", title: "Schedule a meeting", width: 600, render: ({ close, ...context }) => <MeetingComposer context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-010 --------------------------- */
    "ARL-CRM-010": {
      id: "ARL-CRM-010",
      subtitle: () => "Weighted pipeline by category, with the method written down and no claim of predictive certainty.",
      statusStrip: (context) => <ForecastStrip context={context} />,
      tabs: [
        { id: "Current", render: (context) => <ForecastCurrent context={context} /> },
        { id: "Scenarios", render: (context) => <ForecastScenarios context={context} /> },
        { id: "History", render: (context) => <ForecastHistory context={context} /> },
        { id: "Methodology", render: () => <ForecastMethodology /> },
      ],
      actions: [
        { id: "Adjust assumptions", label: "Scenarios", placement: "primary", run: (context) => context.setTab("Scenarios") },
        { id: "drill down", label: "Confidence", placement: "secondary", run: (context) => context.openOverlay("confidence explanation") },
        { id: "review", label: "Override a weighting", placement: "secondary", capability: "edit_pipeline", guard: (context) => (context.selectedId ? undefined : "Select a deal first"), run: (context) => context.openOverlay("override reason") },
        { id: "export", label: "Method", placement: "overflow", run: (context) => context.openOverlay("Forecast model") },
      ],
      overlays: [
        { id: "Forecast model", kind: "drawer", title: "How the forecast is computed", width: 560, render: ({ ...context }) => <ForecastModel context={context} /> },
        { id: "confidence explanation", kind: "drawer", title: "Evidence behind each weighting", width: 720, render: () => <ConfidenceExplanation /> },
        { id: "override reason", kind: "modal", title: "Override a weighting", width: 600, render: ({ close, ...context }) => <OverrideReason context={context} close={close} /> },
      ],
    },

    /* --------------------------- CRM-011 --------------------------- */
    "ARL-CRM-011": {
      id: "ARL-CRM-011",
      subtitle: () => "Rules that assign, task and draft. None of them contacts a customer, and a suppressed contact is always skipped.",
      statusStrip: (context) => <AutomationStrip context={context} />,
      tabs: [
        { id: "Workflows", render: (context) => <WorkflowsTab context={context} /> },
        { id: "Templates", render: () => <TemplatesTab /> },
        { id: "Runs", render: (context) => <RunsTab context={context} /> },
        { id: "Failures", render: (context) => <FailuresTab context={context} /> },
      ],
      actions: [
        { id: "Create rule", label: "New rule", placement: "primary", capability: "run_automation", run: (context) => context.openOverlay("Workflow designer") },
        { id: "simulate", label: "Simulate", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a rule first"), run: (context) => context.openOverlay("test data", { id: context.selectedId }) },
        { id: "activate", label: "Activate", placement: "secondary", capability: "run_automation", guard: (context) => (context.selectedId ? undefined : "Select a rule first"), run: (context) => context.openOverlay("activation approval", { id: context.selectedId }) },
        { id: "stop", label: "Failures", placement: "overflow", run: (context) => context.setTab("Failures") },
      ],
      overlays: [
        { id: "Workflow designer", kind: "drawer", title: "Rule", width: 720, render: ({ close, ...context }) => <WorkflowDesigner context={context} close={close} /> },
        { id: "test data", kind: "drawer", title: "Simulate the rule", width: 720, render: ({ ...context }) => <TestData context={context} /> },
        { id: "activation approval", kind: "modal", title: "Activate the rule", width: 620, render: ({ close, ...context }) => <ActivationApproval context={context} close={close} /> },
      ],
    },
  },

  fallback: (context) => <NotBuilt context={context} />,
});

