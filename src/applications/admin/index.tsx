import {
  AlertTriangle, Building2, CreditCard, Database, FileClock, KeyRound, Lock, Scale,
  ShieldCheck, SlidersHorizontal, Users, Wallet,
} from "lucide-react";
import { Button, Empty } from "@/design-system";
import { registerApp, type ScreenContext } from "@/platform/registry";
import {
  ActionSimulator, AutonomyRevoke, AutonomyScreen, BudgetScreen, BudgetWarning, BusinessHoursForm,
  CostAllocation, DomainVerify, EffectiveRights, GrantEditor, IdentityForm, ImpactReview,
  InviteWizard, MembersScreen, OrganizationSettings, PolicyEditor, RegionChangeImpact, RoleImpact,
  RevokeConfirmation, RolesScreen, SpendLimit,
} from "./panels";
import {
  AuditDetail, AuditFilter, AuditScreen, BillingScreen, BillingSupport, CallbackTester,
  CancellationOverlay, CheckoutOverlay, DataRequestOverlay, DeletionImpact, DeveloperScreen,
  DisasterDrill, EmergencyRevoke, EventChain, ExportAuthorization, JurisdictionDisclaimer,
  KeyCreation, PrivacyScreen, ProviderSetup, RecoveryScreen, RestoreImpact, RetentionCheck,
  ScopeLimits, SecurityReview, SecurityScreen, WebhookForm,
} from "./console";
import {
  ApproveIncrease, ArchiveOrg, AuditRetention, ConfigureEntity, DownloadInvoices, ExportEverything, MembersExport,
  PaySubscription, RevokeKey, RotateKey, SessionsExport, SuspendMember, UpdatePaymentMethod,
} from "./actions";
import { AccessRequestForm, AccessReview } from "./access";

/* ====================================================================== *
 * ADMIN — Administration, Identity, Policy & Billing
 *
 * An administration console, not a dashboard: identity, who holds which view,
 * what agents are allowed to do, what is spent, what is logged, what is kept,
 * what is billed and what can be recovered.
 * ====================================================================== */

const submitFooter = (formId: string, label: string) => ({ close }: { close: () => void }) => (
  <>
    <Button variant="ghost" onClick={close}>Cancel</Button>
    <span className="ds-grow" />
    <Button variant="primary" type="submit" form={formId}>{label}</Button>
  </>
);

export const adminApp = registerApp({
  code: "ADMIN",
  short: "Administration",
  name: "Administration, Identity, Policy & Billing",
  purpose: "Identity, authority, spend and the record of both",
  icon: SlidersHorizontal,
  nav: [
    { label: "Workspace", items: [
      { label: "Organization Settings", screenId: "ARL-ADMIN-001", icon: Building2 },
      { label: "Members & Invitations", screenId: "ARL-ADMIN-002", icon: Users },
    ] },
    { label: "Authority", items: [
      { label: "Roles & Permissions", screenId: "ARL-ADMIN-003", icon: ShieldCheck },
      { label: "Autonomy Centre", screenId: "ARL-ADMIN-004", icon: SlidersHorizontal },
      { label: "Security & Sessions", screenId: "ARL-ADMIN-006", icon: Lock },
    ] },
    { label: "Money", items: [
      { label: "Budget & AI Usage", screenId: "ARL-ADMIN-005", icon: Wallet },
      { label: "Billing & Subscription", screenId: "ARL-ADMIN-009", icon: CreditCard },
    ] },
    { label: "Records", items: [
      { label: "Audit Trail", screenId: "ARL-ADMIN-007", icon: FileClock },
      { label: "Privacy & Data", screenId: "ARL-ADMIN-008", icon: Scale },
      { label: "Backups & Recovery", screenId: "ARL-ADMIN-010", icon: Database },
      { label: "Developer Access", screenId: "ARL-ADMIN-011", icon: KeyRound },
    ] },
  ],
  screens: {
    "ARL-ADMIN-001": {
      id: "ARL-ADMIN-001",
      subtitle: (context) => `Identity, branding, hours and region for ${context.org.name}.`,
      tabs: (["Profile", "Branding", "Business hours", "Regional"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <OrganizationSettings context={context} tab={tab} />,
      })),
      actions: [
        { id: "Edit profile", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Identity form") },
        { id: "configure entity", label: "Configure a legal entity", placement: "secondary", capability: "manage_policy", run: (context) => context.openOverlay("configure entity") },
        { id: "locations", label: "Locations in Headquarters", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/hq/locations`) },
        { id: "verify domain", label: "Verify a domain", placement: "overflow", run: (context) => context.openOverlay("domain verify") },
        { id: "business hours", label: "Set business hours", placement: "overflow", run: (context) => context.openOverlay("business hours") },
        { id: "region", label: "Regional impact", placement: "overflow", run: (context) => context.openOverlay("region change impact") },
      ],
      overlays: [
        { id: "Identity form", kind: "modal", title: "Company identity", width: 560, render: ({ close, ...context }) => <IdentityForm context={context} close={close} /> },
        { id: "region change impact", kind: "drawer", title: "What a regional change touches", width: 500, render: ({ close: _close, ...context }) => <RegionChangeImpact context={context} /> },
        { id: "domain verify", kind: "modal", title: "Verify a domain", width: 560, render: ({ close, ...context }) => <DomainVerify context={context} close={close} /> },
        { id: "business hours", kind: "modal", title: "Business hours", width: 480, render: ({ close, ...context }) => <BusinessHoursForm context={context} close={close} /> },
        { id: "configure entity", kind: "modal", title: "Legal entity", width: 600, render: ({ close, ...context }) => <ConfigureEntity context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-002": {
      id: "ARL-ADMIN-002",
      subtitle: () => "Who holds a view, who is waiting on an invitation, and what leaving removes.",
      tabs: (["Members", "Invitations", "Teams", "External"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <MembersScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Invite", placement: "primary", capability: "edit_people", run: (context) => context.openOverlay("Invite wizard") },
        { id: "role change", label: "Change role view", placement: "secondary", capability: "edit_people", guard: (context) => (context.selectedId ? undefined : "Select a member"), run: (context) => context.openOverlay("role impact", { id: context.selectedId }) },
        { id: "suspend", label: "Suspend or reinstate", placement: "overflow", tone: "danger", capability: "edit_people", guard: (context) => (context.selectedId ? undefined : "Select a member"), run: (context) => context.openOverlay("suspend member") },
        { id: "revoke", label: "Revoke access (offboard)", placement: "overflow", tone: "danger", capability: "edit_people", guard: (context) => (context.selectedId ? undefined : "Select a member"), run: (context) => context.openOverlay("revoke confirmation", { ids: context.selectedId ? [context.selectedId] : [] }) },
        { id: "export", label: "Export the member list", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export members") },
      ],
      overlays: [
        { id: "Invite wizard", kind: "modal", title: "Invite someone", width: 600, render: ({ close, ...context }) => <InviteWizard context={context} close={close} /> },
        { id: "role impact", kind: "drawer", title: "What a role change does", width: 560, render: ({ close, ...context }) => <RoleImpact context={context} close={close} /> },
        { id: "revoke confirmation", kind: "modal", title: "Offboard", tone: "danger", width: 560, blocking: true, render: ({ close, ...context }) => <RevokeConfirmation context={context} close={close} /> },
        { id: "suspend member", kind: "modal", title: "Suspend a member", tone: "danger", width: 540, render: ({ close, ...context }) => <SuspendMember context={context} close={close} /> },
        { id: "export members", kind: "modal", title: "Export the member list", width: 500, render: ({ close, ...context }) => <MembersExport context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-003": {
      id: "ARL-ADMIN-003",
      subtitle: () => "Role views, the policies behind them, and what each one can actually reach.",
      tabs: (["Roles", "Policies", "Effective access", "Exceptions"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <RolesScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Create role", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Policy editor") },
        { id: "compare", label: "Compare two views", placement: "secondary", run: (context) => context.openOverlay("effective rights") },
        { id: "simulate", label: "Simulate a role", placement: "secondary", run: (context) => context.openOverlay("impact review") },
        { id: "publish", label: "Publish a draft", placement: "overflow", capability: "manage_policy", guard: (context) => (context.selectedId ? undefined : "Select a draft role"), run: (context) => context.openOverlay("impact review", { id: context.selectedId }) },
        { id: "request access", label: "Request access", placement: "overflow", run: (context) => context.openOverlay("access request form") },
      ],
      overlays: [
        { id: "Policy editor", kind: "modal", title: "Custom role", width: 620, render: ({ close, ...context }) => <PolicyEditor context={context} close={close} />, footer: submitFooter("policy-editor", "Save draft") },
        { id: "effective rights", kind: "drawer", title: "Compare role views", width: 620, render: ({ close: _close, ...context }) => <EffectiveRights context={context} /> },
        { id: "impact review", kind: "modal", title: "Simulate and publish", width: 640, render: ({ close, ...context }) => <ImpactReview context={context} close={close} /> },
        { id: "access review", kind: "drawer", title: "Review access request", width: 600, render: ({ close, ...context }) => <AccessReview context={context} close={close} /> },
        { id: "access request form", kind: "modal", title: "Request access", width: 540, render: ({ close, ...context }) => <AccessRequestForm context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-004": {
      id: "ARL-ADMIN-004",
      subtitle: () => "What agents and missions may do without asking, with a cap, an expiry and a pause.",
      tabs: (["Company", "Departments", "Agents", "Missions", "History"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <AutonomyScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Set grant", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Grant editor", { id: context.selectedId }) },
        { id: "test permission", label: "Test a permission", placement: "secondary", run: (context) => context.openOverlay("action simulator") },
        { id: "cap action", label: "Cap an action", placement: "overflow", capability: "manage_policy", guard: (context) => (context.selectedId ? undefined : "Select a grant or an agent"), run: (context) => context.openOverlay("Grant editor", { id: context.selectedId }) },
        { id: "suspend", label: "Suspend automation", placement: "overflow", tone: "danger", capability: "manage_policy", run: (context) => context.openOverlay("revoke confirmation", { intent: "pause" }) },
      ],
      overlays: [
        { id: "Grant editor", kind: "modal", title: "Autonomy grant", width: 580, render: ({ close, ...context }) => <GrantEditor context={context} close={close} /> },
        { id: "action simulator", kind: "drawer", title: "Would this be allowed?", width: 560, render: ({ close: _close, ...context }) => <ActionSimulator context={context} /> },
        { id: "revoke confirmation", kind: "modal", title: "Revoke or pause", tone: "danger", width: 560, blocking: true, render: ({ close, ...context }) => <AutonomyRevoke context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-005": {
      id: "ARL-ADMIN-005",
      subtitle: () => "What was committed, what is reserved, and what cannot be reported because no provider is connected.",
      tabs: (["AI", "Missions", "Providers", "Limits", "Invoices"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <BudgetScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Set quota", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Spend limit", { id: context.selectedId }) },
        { id: "inspect", label: "Inspect headroom", placement: "secondary", guard: (context) => (context.selectedId ? undefined : "Select a limit"), run: (context) => context.openOverlay("budget warning", { id: context.selectedId }) },
        { id: "allocate", label: "Allocate to a department", placement: "overflow", capability: "manage_policy", run: (context) => context.openOverlay("cost allocation") },
        { id: "approve increase", label: "Approve an increase", placement: "overflow", capability: "approve_payment", run: (context) => context.openOverlay("approve increase") },
        { id: "request increase", label: "Request an increase", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a limit"), run: (context) => context.openOverlay("budget warning", { id: context.selectedId }) },
      ],
      overlays: [
        { id: "Spend limit", kind: "modal", title: "Spend limit", width: 520, render: ({ close, ...context }) => <SpendLimit context={context} close={close} /> },
        { id: "cost allocation", kind: "modal", title: "Allocate budget", width: 520, render: ({ close, ...context }) => <CostAllocation context={context} close={close} /> },
        { id: "budget warning", kind: "drawer", title: "Headroom", width: 500, render: ({ close: _close, ...context }) => <BudgetWarning context={context} /> },
        { id: "approve increase", kind: "modal", title: "Approve a budget increase", width: 580, render: ({ close, ...context }) => <ApproveIncrease context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-006": {
      id: "ARL-ADMIN-006",
      subtitle: () => "Sign-in intent, the session records held here, the devices they came from and what looks odd.",
      tabs: (["Authentication", "Sessions", "Devices", "Threats"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <SecurityScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Configure SSO", placement: "primary", capability: "manage_connectors", run: (context) => context.openOverlay("Provider setup") },
        { id: "revoke", label: "Revoke sessions", placement: "secondary", tone: "danger", capability: "manage_policy", run: (context) => context.openOverlay("emergency revoke", { id: context.selectedId }) },
        { id: "require MFA", label: "Require a second factor", placement: "overflow", capability: "manage_policy", run: (context) => context.openOverlay("security review", { setting: "mfaRequired" }) },
        { id: "export", label: "Export sessions", placement: "overflow", capability: "export_data", run: (context) => context.openOverlay("export sessions") },
      ],
      overlays: [
        { id: "Provider setup", kind: "modal", title: "Single sign-on", width: 560, render: ({ close, ...context }) => <ProviderSetup context={context} close={close} /> },
        { id: "emergency revoke", kind: "modal", title: "Revoke sessions", tone: "danger", width: 560, blocking: true, capability: "manage_policy", presentation: { guidance: "Verify the affected identities and active sessions before recording an emergency revocation." }, render: ({ close, ...context }) => <EmergencyRevoke context={context} close={close} /> },
        { id: "security review", kind: "modal", title: "Confirm a security change", width: 560, render: ({ close, ...context }) => <SecurityReview context={context} close={close} /> },
        { id: "export sessions", kind: "modal", title: "Export sessions", width: 500, render: ({ close, ...context }) => <SessionsExport context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-007": {
      id: "ARL-ADMIN-007",
      subtitle: () => "Every write in this workspace, who made it, what it touched and how it ended.",
      tabs: (["All", "Access", "Data", "Financial", "AI"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <AuditScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "inspect receipt", label: "Inspect the receipt", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select an entry"), run: (context) => context.openOverlay("Audit detail", { id: context.selectedId }) },
        { id: "Filter", label: "Filter", placement: "secondary", run: (context) => context.openOverlay("audit filter") },
        { id: "export", label: "Export", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("export authorization") },
        { id: "retention", label: "Audit retention", placement: "overflow", run: (context) => context.openOverlay("audit retention") },
      ],
      overlays: [
        { id: "Audit detail", kind: "drawer", title: "Audit entry", width: 520, render: ({ close: _close, ...context }) => <AuditDetail context={context} /> },
        { id: "export authorization", kind: "modal", title: "Authorise an export", width: 560, render: ({ close, ...context }) => <ExportAuthorization context={context} close={close} /> },
        { id: "event chain", kind: "drawer", title: "Everything on this record", width: 560, render: ({ close: _close, ...context }) => <EventChain context={context} /> },
        { id: "audit filter", kind: "drawer", title: "Narrow the trail", width: 440, render: ({ close: _close, ...context }) => <AuditFilter context={context} /> },
        { id: "audit retention", kind: "modal", title: "Audit retention", width: 540, render: ({ close, ...context }) => <AuditRetention context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-008": {
      id: "ARL-ADMIN-008",
      subtitle: () => "What is kept and why, what people have asked for, and what a legal hold prevents.",
      tabs: (["Retention", "Consent", "Requests", "Processing", "Residency"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <PrivacyScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Review request", placement: "primary", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("Data request", { id: context.selectedId }) },
        { id: "export", label: "Export subject data", placement: "secondary", capability: "export_data", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("Data request", { id: context.selectedId }) },
        { id: "restrict", label: "Restrict processing", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("Data request", { id: context.selectedId }) },
        { id: "delete where lawful", label: "Delete where lawful", placement: "overflow", tone: "danger", capability: "delete_records", guard: (context) => (context.selectedId ? undefined : "Select a request"), run: (context) => context.openOverlay("deletion impact", { id: context.selectedId }) },
        { id: "jurisdiction", label: "Limits of this page", placement: "overflow", run: (context) => context.openOverlay("jurisdiction disclaimer") },
      ],
      overlays: [
        { id: "Data request", kind: "drawer", title: "Subject request", width: 580, render: ({ close, ...context }) => <DataRequestOverlay context={context} close={close} /> },
        { id: "deletion impact", kind: "modal", title: "What deletion would remove", tone: "danger", width: 620, blocking: true, render: ({ close, ...context }) => <DeletionImpact context={context} close={close} /> },
        { id: "jurisdiction disclaimer", kind: "modal", title: "What this console does not do", width: 540, render: ({ close: _close, ...context }) => <JurisdictionDisclaimer context={context} /> },
      ],
    },

    "ARL-ADMIN-009": {
      id: "ARL-ADMIN-009",
      subtitle: () => "Plan, seats and invoices as records. No processor is connected and no card is collected.",
      tabs: (["Overview", "Invoices", "Usage", "Payment"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <BillingScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Manage subscription", placement: "primary", capability: "manage_policy", run: (context) => context.openOverlay("Checkout") },
        {
          id: "pay", label: "Pay (held at the processor)", placement: "secondary", capability: "manage_policy",
          run: (context) => context.openOverlay("pay subscription"),
        },
        { id: "download invoice", label: "Download invoices", placement: "overflow", run: (context) => context.openOverlay("download invoices") },
        { id: "update method", label: "Update the payment method", placement: "overflow", capability: "manage_policy", run: (context) => context.openOverlay("update method") },
        { id: "billing question", label: "Ask a billing question", placement: "overflow", run: (context) => context.openOverlay("billing support") },
        { id: "cancel", label: "Cancel subscription", placement: "overflow", tone: "danger", capability: "manage_policy", run: (context) => context.openOverlay("cancellation") },
      ],
      overlays: [
        { id: "Checkout", kind: "modal", title: "Subscription", width: 560, render: ({ close, ...context }) => <CheckoutOverlay context={context} close={close} /> },
        { id: "cancellation", kind: "modal", title: "Cancel the subscription", tone: "danger", width: 560, render: ({ close, ...context }) => <CancellationOverlay context={context} close={close} /> },
        { id: "billing support", kind: "modal", title: "Billing question", width: 560, render: ({ close, ...context }) => <BillingSupport context={context} close={close} /> },
        { id: "pay subscription", kind: "modal", title: "Pay a subscription invoice", width: 560, render: ({ close, ...context }) => <PaySubscription context={context} close={close} /> },
        { id: "download invoices", kind: "modal", title: "Download invoices", width: 520, render: ({ close, ...context }) => <DownloadInvoices context={context} close={close} /> },
        { id: "update method", kind: "modal", title: "Payment method", width: 540, render: ({ close, ...context }) => <UpdatePaymentMethod context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-010": {
      id: "ARL-ADMIN-010",
      subtitle: () => "Snapshots inside this browser, exports you keep, rehearsed restores and the jobs that failed.",
      tabs: (["Backups", "Exports", "Restores", "Failures"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <RecoveryScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Request backup", label: "Request a backup", placement: "primary", run: (context) => context.openOverlay("retention check") },
        { id: "restore test", label: "Rehearse a restore", placement: "secondary", run: (context) => context.openOverlay("Restore impact") },
        { id: "export", label: "Export everything", placement: "secondary", capability: "export_data", run: (context) => context.openOverlay("export everything") },
        { id: "archive org", label: "Archive the organisation", placement: "overflow", tone: "danger", capability: "manage_policy", run: (context) => context.openOverlay("archive org") },
        { id: "recovery drill", label: "Recovery drill", placement: "overflow", run: (context) => context.openOverlay("disaster drill") },
      ],
      overlays: [
        { id: "Restore impact", kind: "modal", title: "What a restore would overwrite", width: 620, render: ({ close, ...context }) => <RestoreImpact context={context} close={close} /> },
        { id: "retention check", kind: "modal", title: "Take a snapshot", width: 560, render: ({ close, ...context }) => <RetentionCheck context={context} close={close} /> },
        { id: "disaster drill", kind: "drawer", title: "Recovery readiness", width: 520, render: ({ close: _close, ...context }) => <DisasterDrill context={context} /> },
        { id: "export everything", kind: "modal", title: "Export everything", width: 520, render: ({ close, ...context }) => <ExportEverything context={context} close={close} /> },
        { id: "archive org", kind: "modal", title: "Archive the organisation", width: 580, tone: "danger", blocking: true, render: ({ close, ...context }) => <ArchiveOrg context={context} close={close} /> },
      ],
    },

    "ARL-ADMIN-011": {
      id: "ARL-ADMIN-011",
      subtitle: () => "Keys, endpoints and environments — recorded honestly, including what does not exist.",
      tabs: (["API", "Webhooks", "Sandbox", "Logs"] as const).map((tab) => ({
        id: tab,
        render: (context: ScreenContext) => <DeveloperScreen context={context} tab={tab} />,
      })),
      actions: [
        { id: "Issue key", placement: "primary", capability: "manage_connectors", run: (context) => context.openOverlay("Key creation") },
        { id: "test webhook", label: "Test an endpoint", placement: "secondary", run: (context) => context.openOverlay("callback tester", { id: context.selectedId }) },
        { id: "rotate", label: "Rotate a key", placement: "overflow", capability: "manage_connectors", guard: (context) => (context.selectedId ? undefined : "Select a key"), run: (context) => context.openOverlay("rotate key") },
        { id: "revoke", label: "Revoke a key", placement: "overflow", tone: "danger", capability: "manage_connectors", guard: (context) => (context.selectedId ? undefined : "Select a key"), run: (context) => context.openOverlay("revoke key") },
        { id: "key scope", label: "What a key can reach", placement: "overflow", guard: (context) => (context.selectedId ? undefined : "Select a key"), run: (context) => context.openOverlay("scope limits", { id: context.selectedId }) },
        { id: "add webhook", label: "Add an endpoint", placement: "overflow", capability: "manage_connectors", run: (context) => context.openOverlay("webhook form") },
      ],
      overlays: [
        { id: "Key creation", kind: "modal", title: "Issue an API key", width: 560, render: ({ close, ...context }) => <KeyCreation context={context} close={close} /> },
        { id: "scope limits", kind: "drawer", title: "What this key can reach", width: 520, render: ({ close: _close, ...context }) => <ScopeLimits context={context} /> },
        { id: "callback tester", kind: "modal", title: "Endpoint test", width: 620, render: ({ close, ...context }) => <CallbackTester context={context} close={close} /> },
        { id: "webhook form", kind: "modal", title: "Add an endpoint", width: 560, render: ({ close, ...context }) => <WebhookForm context={context} close={close} /> },
        { id: "rotate key", kind: "modal", title: "Rotate an API key", width: 560, render: ({ close, ...context }) => <RotateKey context={context} close={close} /> },
        { id: "revoke key", kind: "modal", title: "Revoke an API key", width: 560, tone: "danger", blocking: true, render: ({ close, ...context }) => <RevokeKey context={context} close={close} /> },
      ],
    },
  },
  fallback: (context) => (
    <Empty title={`${context.screen.title} is not built yet`} icon={<AlertTriangle size={20} />}>
      This screen is in the approved contract for Administration but has no implementation in this module. It is recorded as
      outstanding rather than shown as a generic settings page.
    </Empty>
  ),
});
