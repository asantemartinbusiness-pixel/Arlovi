import { BarChart3, FileText, LifeBuoy, MessageSquare, Receipt, ShieldCheck, Wand2 } from "lucide-react";
import { Empty, Notice, Pill, Properties, Row, Stack } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { submitFooter } from "@/applications/market/kit";
import "@/applications/market/growth.css";
import { bodyOf, portalDocuments, sharedRecords, statusTone, usePortalData, type PortalBody } from "./data";
import {
  ExternalDashboard, ExternalMessaging, PortalAdmin, PortalBilling, PortalBuilder,
  PortalDirectory, SharedDocuments, usePortal,
} from "./panels";
import {
  AccessRequest, AccessSetup, AccountRecovery, AttachmentPreview, ClientMessage, ComplaintForm,
  ConversationDetails, DataGrant, DisputeForm, DocumentPreview, DocumentReceipt, ExternalInvite,
  ModulePicker, PaymentProvider, PermissionRequest, PortalBranding, PortalWizard, PublishReview,
  ScopePreview, SharedItemInspector, SignatureRequest,
} from "./overlays";

/* ====================================================================== *
 * PORTAL — Client & Partner Portals
 * A portal shares exactly the records it names, nothing else, and the
 * client role view opens portal content and nothing else in the workspace.
 * ====================================================================== */

const needsSelection = (context: ScreenContext) => (context.selectedId ? undefined : "Select a row first");
const internalOnly = (context: ScreenContext) => (context.role === "client" ? "This view opens portal content only" : undefined);

export const portalApp = registerApp({
  code: "PORTAL",
  short: "Portals",
  name: "Client & Partner Portals",
  purpose: "Scoped spaces for the people outside the company",
  icon: LifeBuoy,
  nav: [
    { items: [
      { label: "Portal Directory", screenId: "ARL-PORTAL-001", icon: LifeBuoy },
    ] },
    { label: "One portal", items: [
      { label: "Builder", screenId: "ARL-PORTAL-002", icon: Wand2 },
      { label: "Client dashboard", screenId: "ARL-PORTAL-003", icon: BarChart3 },
      { label: "Shared documents", screenId: "ARL-PORTAL-004", icon: FileText },
      { label: "Messages", screenId: "ARL-PORTAL-005", icon: MessageSquare },
      { label: "Billing & requests", screenId: "ARL-PORTAL-006", icon: Receipt },
      { label: "Access & analytics", screenId: "ARL-PORTAL-007", icon: ShieldCheck },
    ] },
  ],
  screens: {
    /* ------------------------------ 001 ------------------------------ */
    "ARL-PORTAL-001": {
      id: "ARL-PORTAL-001",
      subtitle: (context) => `Every space ${context.org.shortName} shares with someone outside the company.`,
      tabs: ["Clients", "Customers", "Suppliers", "Partners"].map((audience) => ({
        id: audience,
        render: (context: ScreenContext) => <PortalDirectory context={context} audience={audience} />,
      })),
      actions: [
        { id: "Create", label: "New portal", placement: "primary", guard: internalOnly, run: (context) => context.openOverlay("Portal wizard") },
        { id: "clone", label: "Branding", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("branding", { id: context.selectedId }) },
        { id: "preview", label: "Access", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("access setup", { id: context.selectedId }) },
        { id: "suspend", label: "Suspend selected", placement: "overflow", tone: "danger", guard: needsSelection, run: async (context) => {
          const id = context.selectedId!;
          await context.mutate.patch(id, { status: "suspended" }, { event: "Portal suspended" });
          context.toast("Suspended", "Its links stop resolving for the portal's users straight away.");
        } },
      ],
      overlays: [
        { id: "Portal wizard", kind: "drawer", title: "New portal", width: 640, render: ({ close, ...context }) => <PortalWizard context={context} close={close} />, footer: submitFooter("portal-wizard", "Create portal") },
        { id: "branding", kind: "modal", title: "Branding", width: 560, render: ({ close, ...context }) => <PortalBranding context={context} close={close} />, footer: submitFooter("portal-branding", "Save branding") },
        { id: "access setup", kind: "modal", title: "Access", width: 580, render: ({ close, ...context }) => <AccessSetup context={context} close={close} />, footer: submitFooter("access-setup", "Save access") },
      ],
    },

    /* ------------------------------ 002 ------------------------------ */
    "ARL-PORTAL-002": {
      id: "ARL-PORTAL-002",
      title: () => "Portal builder",
      subtitle: () => "Pages, modules and the records each one is allowed to render.",
      tabs: ["Pages", "Design", "Data", "Access", "Preview"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PortalBuilder context={context} lens={lens} />,
      })),
      actions: [
        { id: "Drag modules", label: "Edit a page", placement: "primary", guard: (context) => internalOnly(context) ?? needsSelection(context), run: (context) => context.openOverlay("Module picker", { pageId: context.selectedId }) },
        { id: "bind permitted data", label: "Share a record", placement: "primary", guard: internalOnly, run: (context) => context.openOverlay("data grant") },
        { id: "test", label: "Preview as the client", placement: "secondary", guard: internalOnly, run: (context) => context.setTab("Preview") },
        { id: "publish", label: "Publish review", placement: "overflow", guard: internalOnly, run: (context) => context.openOverlay("publish review") },
      ],
      overlays: [
        { id: "Module picker", kind: "drawer", title: "Page modules", width: 600, render: ({ close, ...context }) => <ModulePicker context={context} close={close} />, footer: submitFooter("module-picker", "Save page") },
        { id: "data grant", kind: "modal", title: "Share one record", width: 620, render: ({ close, ...context }) => <DataGrant context={context} close={close} />, footer: submitFooter("data-grant", "Share this record") },
        { id: "publish review", kind: "modal", title: "Publish review", width: 580, render: ({ close, ...context }) => <PublishReview context={context} close={close} /> },
      ],
    },

    /* ------------------------------ 003 ------------------------------ */
    "ARL-PORTAL-003": {
      id: "ARL-PORTAL-003",
      title: () => "Client dashboard",
      subtitle: (context) => (context.role === "client" ? "Everything shared with you, and nothing else." : "What the client sees when they sign in."),
      tabs: ["Overview", "Work", "Files", "Messages", "Billing"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ExternalDashboard context={context} lens={lens} />,
      })),
      statusStrip: (context) => (
        <Row gap={2} wrap>
          <Pill tone={context.role === "client" ? "accent" : "neutral"} dot>{context.role === "client" ? "Client view" : "Internal preview"}</Pill>
          <span className="ds-subtle">A portal renders only the records it names. No figure here aggregates across clients.</span>
        </Row>
      ),
      actions: [
        { id: "View", label: "Message the studio", placement: "primary", run: (context) => context.openOverlay("client message") },
        { id: "request service", label: "Request something", placement: "secondary", run: (context) => context.openOverlay("access request") },
        { id: "comment", label: "Inspect a shared item", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("Shared item inspector", { id: context.selectedId }) },
        { id: "approve scoped item", label: "Accept a document", placement: "overflow", run: (context) => context.openOverlay("Shared item inspector", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Shared item inspector", kind: "drawer", title: "Shared item", width: 580, render: ({ ...context }) => <SharedItemInspector context={context} /> },
        { id: "client message", kind: "modal", title: "Message the studio", width: 580, render: ({ close, ...context }) => <ClientMessage context={context} close={close} />, footer: submitFooter("client-message", "Record message") },
        { id: "access request", kind: "modal", title: "Request something", width: 580, render: ({ close, ...context }) => <AccessRequest context={context} close={close} />, footer: submitFooter("access-request", "Send request") },
      ],
    },

    /* ------------------------------ 004 ------------------------------ */
    "ARL-PORTAL-004": {
      id: "ARL-PORTAL-004",
      title: () => "Shared documents",
      subtitle: () => "Versions, expiry and acceptance. An expired or revoked link stops working at once.",
      tabs: ["Shared", "Needs review", "Signed", "Archive"].map((state) => ({
        id: state,
        render: (context: ScreenContext) => <SharedDocuments context={context} state={state} />,
      })),
      actions: [
        { id: "View", label: "Open selected", placement: "primary", guard: needsSelection, run: (context) => context.openOverlay("Document preview", { id: context.selectedId }) },
        { id: "download", label: "Accept and sign", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("signature", { id: context.selectedId }) },
        { id: "comment", label: "Ask about it", placement: "secondary", run: (context) => context.openOverlay("permission request") },
        { id: "request access", label: "Request access", placement: "overflow", run: (context) => context.openOverlay("permission request") },
      ],
      overlays: [
        { id: "Document preview", kind: "drawer", title: "Document", width: 640, render: ({ ...context }) => <DocumentPreview context={context} /> },
        { id: "permission request", kind: "modal", title: "Request access", width: 560, render: ({ close, ...context }) => <PermissionRequest context={context} close={close} />, footer: submitFooter("access-request", "Send request") },
        { id: "signature", kind: "modal", title: "Accept this version", width: 580, render: ({ close, ...context }) => <SignatureRequest context={context} close={close} />, footer: submitFooter("signature-request", "Record acceptance") },
      ],
    },

    /* ------------------------------ 005 ------------------------------ */
    "ARL-PORTAL-005": {
      id: "ARL-PORTAL-005",
      title: () => "Portal messages",
      subtitle: () => "One thread per portal. Nothing is delivered: no mail provider is connected.",
      tabs: ["Inbox", "Requests", "History"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ExternalMessaging context={context} lens={lens} />,
      })),
      actions: [
        { id: "Reply", label: "Reply", placement: "primary", run: (context) => context.openOverlay("client message") },
        { id: "upload", label: "Attachments", placement: "secondary", run: (context) => context.openOverlay("attachment preview") },
        { id: "book meeting", label: "Book a meeting", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/book/calendar`) },
        { id: "escalate", label: "Raise a complaint", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("complaint") },
      ],
      overlays: [
        { id: "Conversation details", kind: "drawer", title: "Conversation", width: 600, render: ({ ...context }) => <ConversationDetails context={context} /> },
        { id: "attachment preview", kind: "drawer", title: "Attachments", width: 600, render: ({ ...context }) => <AttachmentPreview context={context} /> },
        { id: "complaint", kind: "modal", title: "Raise a complaint", width: 580, render: ({ close, ...context }) => <ComplaintForm context={context} close={close} />, footer: submitFooter("complaint-form", "Record complaint") },
        { id: "client message", kind: "modal", title: "Message", width: 580, render: ({ close, ...context }) => <ClientMessage context={context} close={close} />, footer: submitFooter("client-message", "Record message") },
      ],
    },

    /* ------------------------------ 006 ------------------------------ */
    "ARL-PORTAL-006": {
      id: "ARL-PORTAL-006",
      title: () => "Billing and requests",
      subtitle: (context) => `Totals resolve through the ${context.org.jurisdiction} tax rules. There is no payment link, and no card detail is ever asked for.`,
      tabs: ["Invoices", "Payments", "Requests", "History"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PortalBilling context={context} lens={lens} />,
      })),
      actions: [
        { id: "Pay", label: "How to pay", placement: "primary", run: (context) => context.openOverlay("Payment provider", { id: context.selectedId }) },
        { id: "download", label: "Download an invoice", placement: "secondary", guard: needsSelection, run: (context) => context.openOverlay("document receipt", { id: context.selectedId }) },
        { id: "submit request", label: "Submit a request", placement: "secondary", run: (context) => context.openOverlay("dispute form", { kind: "request" }) },
        { id: "dispute", label: "Dispute an invoice", placement: "overflow", tone: "danger", guard: needsSelection, run: (context) => context.openOverlay("dispute form", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Payment provider", kind: "drawer", title: "Paying this invoice", width: 640, render: ({ ...context }) => <PaymentProvider context={context} /> },
        { id: "dispute form", kind: "modal", title: "Dispute or request", width: 600, render: ({ close, ...context }) => <DisputeForm context={context} close={close} />, footer: submitFooter("dispute-form", "Record it") },
        { id: "document receipt", kind: "drawer", title: "Invoice", width: 680, render: ({ ...context }) => <DocumentReceipt context={context} /> },
      ],
    },

    /* ------------------------------ 007 ------------------------------ */
    "ARL-PORTAL-007": {
      id: "ARL-PORTAL-007",
      title: () => "Access and analytics",
      subtitle: () => "Who can sign in, what they can reach, and what has actually been recorded.",
      tabs: ["Users", "Access", "Analytics", "Audit"].map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <PortalAdmin context={context} lens={lens} />,
      })),
      actions: [
        { id: "Invite", label: "Invite someone", placement: "primary", guard: internalOnly, run: (context) => context.openOverlay("External invite") },
        { id: "set expiry", label: "Extend or revoke", placement: "secondary", guard: internalOnly, run: (context) => context.openOverlay("account recovery") },
        { id: "revoke", label: "What this portal reaches", placement: "secondary", guard: internalOnly, run: (context) => context.openOverlay("scope preview") },
        { id: "review activity", label: "Audit", placement: "overflow", guard: internalOnly, run: (context) => context.setTab("Audit") },
      ],
      overlays: [
        { id: "External invite", kind: "modal", title: "Invite an external user", width: 620, render: ({ close, ...context }) => <ExternalInvite context={context} close={close} />, footer: submitFooter("external-invite", "Record invitation") },
        { id: "scope preview", kind: "drawer", title: "What this portal reaches", width: 660, render: ({ ...context }) => <ScopePreview context={context} /> },
        { id: "account recovery", kind: "modal", title: "Extend or revoke access", width: 600, render: ({ close, ...context }) => <AccountRecovery context={context} close={close} />, footer: submitFooter("account-recovery", "Apply") },
      ],
      inspector: (context) => <PortalFacts context={context} />,
      inspectorTitle: "Portal facts",
    },
  },
});

function PortalFacts({ context }: { context: ScreenContext }) {
  const data = usePortalData();
  const { portal } = usePortal(context);
  const { role } = useWorkspace();
  if (!portal) return <Empty title="No portal" >Open a portal to see its facts here.</Empty>;
  const body = bodyOf<PortalBody>(portal, {});
  return (
    <Stack gap={4}>
      <Properties rows={[
        { label: "Portal", value: portal.title },
        { label: "Audience", value: String(portal.fields.audience ?? "—") },
        { label: "State", value: <Pill tone={statusTone(portal.status)} dot>{portal.status}</Pill> },
        { label: "Records shared", value: <span className="ds-num">{String(sharedRecords(portal, data).length + portalDocuments(portal, data.documents).length)}</span> },
        { label: "External users", value: <span className="ds-num">{String((body.users ?? []).length)}</span> },
        { label: "Link expiry", value: <span className="ds-num">{String(portal.fields.linkExpiryDays ?? 0)} days</span> },
        { label: "Your role view", value: role },
      ]} />
      <Notice tone="info" title="Scope is a list, not a rule">
        Everything this portal can reach is named on its own record. There is no rule that widens it as new records are created, which is why a portal cannot drift into showing another client's work.
      </Notice>
    </Stack>
  );
}
