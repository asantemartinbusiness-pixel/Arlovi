import { Boxes, HeartPulse, Plug, Receipt, RefreshCcw, Shapes, Wand2 } from "lucide-react";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { closeFooter, submitFooter } from "@/applications/t6kit/kit";
import {
  ActionReceipts, CapabilityInspector, CapabilityRegistry, ConflictResolver, ConnectionDetail,
  ConnectionWizard, Connections, ConnectorDetail, ConnectorHealth, ConnectorPreview, ConsentStatus,
  CustomConnectors, ExternalOAuth, MappingEditor, Marketplace, ProviderEvidence, ReceiptDetail,
  RetryReview, RevokeGrant, RiskSummary, ScopeReview, SyncCentre,
} from "./panels";
import { CONNECTOR_ENTRIES } from "./catalog";
import { Button, Notice, Properties, Stack } from "@/design-system";

/* ====================================================================== *
 * CONNECT — Integrations & Connectors
 * Every provider in src/platform/capability.ts is listed with what it
 * would enable, the scopes it would request, its state (not connected,
 * every one) and what Arlovi does locally instead. The authorisation flow
 * walks to the point where it cannot continue and says why.
 * ====================================================================== */

function InstallWizard({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { id?: string } | undefined;
  const entry = CONNECTOR_ENTRIES.find((item) => item.capability.id === payload?.id) ?? CONNECTOR_ENTRIES[0];
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="There is nothing to install">
        A connector is not software that is installed here; it is an authorisation held against a provider account. Without a server to complete that authorisation, installing would only set a label.
      </Notice>
      <Properties rows={[
        { label: "Capability", value: entry.capability.label },
        { label: "Provider", value: entry.capability.provider },
        { label: "Would request", value: <span className="ds-num">{`${entry.scopes.length} scopes`}</span> },
        { label: "Instead", value: entry.capability.localEquivalent },
      ]} />
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/connect/connect/${entry.capability.id}`); }}>
        Walk the authorisation and see where it stops
      </Button>
    </Stack>
  );
}

function ScopeChangePanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="A scope cannot be changed without a grant">
        Widening or narrowing access means asking the provider again. With no grant, there is nothing to re-ask about.
      </Notice>
      <Properties rows={[
        { label: "Scopes granted", value: <span className="ds-num">0</span> },
        { label: "Change would require", value: "A fresh authorisation, approved by the account holder" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace`)}>Back to the directory</Button>
    </Stack>
  );
}

function ReconnectDialog({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="warning" title="Reconnecting is the same flow that cannot complete">
        There is no previous connection to restore. Reconnect and connect are the same action, and both stop at the provider redirect.
      </Notice>
      <Button variant="secondary" onClick={() => { context.closeOverlay(); context.navigate(`/o/${context.org.slug}/connect/connect/${CONNECTOR_ENTRIES[0].capability.id}`); }}>
        Open the authorisation flow
      </Button>
    </Stack>
  );
}

function HealthReport({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Properties rows={[
        { label: "Capabilities in the register", value: <span className="ds-num">{String(CONNECTOR_ENTRIES.length)}</span> },
        { label: "Connected", value: <span className="ds-num">0</span> },
        { label: "Local checks that passed", value: <span className="ds-num">2</span> },
        { label: "Checks needing a provider", value: <span className="ds-num">3</span> },
      ]} />
      <Notice tone="info" title="The report says what was attempted">
        Two checks read the register and the connector records in this browser. Three would need a network call, and were not attempted rather than failed.
      </Notice>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/receipts`)}>Read the receipts</Button>
    </Stack>
  );
}

function MitigationPanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="info" title="What can be done without the provider">
        Every capability has a local equivalent, and those are what the workspace runs on now. The list is the mitigation.
      </Notice>
      <div className="t6-matrix-wrap">
        <table className="t6-matrix">
          <caption className="ds-sr-only">Local mitigation per capability</caption>
          <thead><tr><th scope="col">Capability</th><th scope="col">Mitigation in place</th></tr></thead>
          <tbody>
            {CONNECTOR_ENTRIES.map((entry) => (
              <tr key={entry.capability.id}><th scope="row">{entry.capability.label}</th><td>{entry.capability.localEquivalent}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/incidents`)}>Open the incident queue</Button>
    </Stack>
  );
}

function ApprovalPanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={3}>
      <Notice tone="info" title="Approval widens what agents may ask for">
        Publishing an adapter adds operations to the registry. That is a decision a person makes, and it is recorded, because an agent will later choose an operation by name.
      </Notice>
      <Button variant="primary" onClick={async () => {
        await context.mutate.log("Custom adapter submitted for approval. It cannot be used until a person approves it and a provider exists.", { type: "capability", capability: "configuration_required" });
        context.toast("Submitted", "The submission is recorded in the receipts as awaiting approval.", "blocked");
        context.closeOverlay();
      }}>Submit for approval</Button>
    </Stack>
  );
}

export const connectApp = registerApp({
  code: "CONNECT",
  short: "Integrations",
  name: "Integrations & Connectors",
  purpose: "What each provider would do, what it would need, and what runs here instead",
  icon: Plug,
  nav: [
    {
      items: [
        { label: "Directory", screenId: "ARL-CONNECT-001", icon: Boxes },
        { label: "Connections", screenId: "ARL-CONNECT-004", icon: Plug },
        { label: "Capabilities", screenId: "ARL-CONNECT-006", icon: Shapes },
      ],
    },
    {
      label: "Operations", items: [
        { label: "Synchronisation", screenId: "ARL-CONNECT-007", icon: RefreshCcw },
        { label: "Health", screenId: "ARL-CONNECT-008", icon: HeartPulse },
        { label: "Receipts", screenId: "ARL-CONNECT-010", icon: Receipt },
        { label: "Custom adapters", screenId: "ARL-CONNECT-009", icon: Wand2 },
      ],
    },
  ],
  screens: {
    "ARL-CONNECT-001": {
      id: "ARL-CONNECT-001",
      title: () => "Integration directory",
      subtitle: () => "Every provider in the capability register, with the state it actually holds.",
      tabs: (["Featured", "Categories", "Installed", "Custom"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Marketplace context={context} lens={lens} />,
      })),
      actions: [
        { id: "Browse", label: "Browse by category", placement: "primary", run: (context) => context.setTab("Categories") },
        { id: "inspect requirements", label: "What one needs", placement: "secondary", run: (context) => context.openOverlay("Connector preview") },
        { id: "compare", label: "Capability registry", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/connect/capabilities`) },
        { id: "install", label: "Install", placement: "overflow", run: (context) => context.openOverlay("install wizard") },
      ],
      overlays: [
        { id: "Connector preview", kind: "drawer", title: "Connector", width: 520, render: ({ ...context }) => <ConnectorPreview context={context} /> },
        { id: "install wizard", kind: "modal", title: "Install", width: 560, render: ({ ...context }) => <InstallWizard context={context} />, footer: closeFooter() },
        { id: "risk summary", kind: "modal", title: "Risk", width: 560, render: ({ ...context }) => <RiskSummary context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-002": {
      id: "ARL-CONNECT-002",
      title: () => "Connector",
      subtitle: () => "Read scopes and write scopes are shown apart, because they are not the same decision.",
      tabs: (["Overview", "Capabilities", "Permissions", "Versions", "Help"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectorDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Connect", label: "Connect", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/connect/connect/${context.params.id ?? CONNECTOR_ENTRIES[0].capability.id}`) },
        { id: "test", label: "Authorisation preview", placement: "secondary", run: (context) => context.openOverlay("Authorization preview") },
        { id: "view docs", label: "Provider limits", placement: "overflow", run: (context) => context.openOverlay("provider limits") },
        { id: "request capability", label: "Scopes explained", placement: "overflow", run: (context) => context.openOverlay("scope explanation") },
      ],
      overlays: [
        { id: "Authorization preview", kind: "drawer", title: "Authorisation", width: 560, render: ({ ...context }) => <ExternalOAuth context={context} /> },
        { id: "scope explanation", kind: "drawer", title: "Scopes", width: 520, render: ({ ...context }) => <ScopeReview context={context} /> },
        { id: "provider limits", kind: "modal", title: "Provider limits", width: 560, render: ({ ...context }) => <RiskSummary context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-003": {
      id: "ARL-CONNECT-003",
      title: () => "Authorise a connector",
      subtitle: () => "The flow runs as far as it can and then stops, without leaving a connection behind.",
      tabs: (["Account", "Permissions", "Test", "Confirm"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectionWizard context={context} lens={lens} />,
      })),
      actions: [
        { id: "Authorize", label: "Attempt the authorisation", placement: "primary", run: (context) => context.setTab("Test") },
        { id: "choose targets", label: "Review the scopes", placement: "secondary", run: (context) => context.openOverlay("scope review") },
        { id: "test", label: "Consent record", placement: "overflow", run: (context) => context.openOverlay("consent status") },
        { id: "cancel", label: "Leave it unconnected", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/connect/marketplace`) },
      ],
      overlays: [
        { id: "External OAuth", kind: "modal", title: "Leaving for the provider", tone: "danger", width: 560, render: ({ ...context }) => <ExternalOAuth context={context} />, footer: closeFooter() },
        { id: "scope review", kind: "drawer", title: "Scopes", width: 540, render: ({ ...context }) => <ScopeReview context={context} /> },
        { id: "consent status", kind: "drawer", title: "Consent", width: 520, render: ({ ...context }) => <ConsentStatus context={context} /> },
      ],
    },

    "ARL-CONNECT-004": {
      id: "ARL-CONNECT-004",
      title: () => "Connections",
      subtitle: (context) => `Connector records in ${context.org.name}, each showing the state the capability register reports.`,
      tabs: (["All", "Healthy", "Needs action", "Disabled"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Connections context={context} lens={lens} />,
      })),
      actions: [
        {
          id: "Inspect", label: "Inspect", placement: "primary",
          guard: (context) => (context.selectedId ? undefined : "Select a connection first"),
          run: (context) => context.navigate(`/o/${context.org.slug}/connect/connections/${context.selectedId}`),
        },
        { id: "reconnect", label: "Reconnect", placement: "secondary", run: (context) => context.openOverlay("reconnect") },
        { id: "suspend", label: "Scope change", placement: "overflow", run: (context) => context.openOverlay("scope change") },
        { id: "transfer owner", label: "Revoke", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("revoke grant") },
      ],
      overlays: [
        { id: "Account inspector", kind: "drawer", title: "Account", width: 520, render: ({ ...context }) => <ConsentStatus context={context} /> },
        { id: "scope change", kind: "modal", title: "Change scopes", width: 520, render: ({ ...context }) => <ScopeChangePanel context={context} />, footer: closeFooter() },
        { id: "revoke grant", kind: "modal", title: "Revoke", tone: "danger", width: 520, render: ({ ...context }) => <RevokeGrant context={context} />, footer: closeFooter() },
        { id: "reconnect", kind: "modal", title: "Reconnect", width: 520, render: ({ ...context }) => <ReconnectDialog context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-005": {
      id: "ARL-CONNECT-005",
      title: () => "Connection",
      subtitle: () => "What this connection would be allowed to do, and what it holds now, which is nothing.",
      tabs: (["Overview", "Capabilities", "Sync", "Activity", "Security"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectionDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Test", label: "Run a health test", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/connect/health`) },
        { id: "limit agents", label: "What agents may use", placement: "secondary", run: (context) => context.setTab("Capabilities") },
        { id: "rotate auth", label: "Keys and grant", placement: "overflow", run: (context) => context.setTab("Security") },
        { id: "disable", label: "Revoke", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("revoke grant") },
      ],
      overlays: [
        { id: "Permission matrix", kind: "drawer", title: "Permissions", width: 620, render: ({ ...context }) => <ConnectorDetail context={context} lens="Permissions" /> },
        { id: "health run", kind: "modal", title: "Health test", width: 560, render: ({ ...context }) => <HealthReport context={context} />, footer: closeFooter() },
        { id: "reconnect dialog", kind: "modal", title: "Reconnect", width: 520, render: ({ ...context }) => <ReconnectDialog context={context} />, footer: closeFooter() },
        { id: "revoke grant", kind: "modal", title: "Revoke", tone: "danger", width: 520, render: ({ ...context }) => <RevokeGrant context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-006": {
      id: "ARL-CONNECT-006",
      title: () => "Capability registry",
      subtitle: () => "Normalised operations an agent chooses by name, so changing the provider does not rewrite the mission.",
      tabs: (["Actions", "Reads", "Webhooks", "Versions"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CapabilityRegistry context={context} lens={lens} />,
      })),
      actions: [
        { id: "Inspect schema", label: "Inspect a schema", placement: "primary", run: (context) => context.openOverlay("Capability inspector") },
        { id: "compare", label: "Versions", placement: "secondary", run: (context) => context.setTab("Versions") },
        { id: "test mock", label: "Why a mock is not offered", placement: "overflow", run: (context) => context.openOverlay("schema diff") },
        { id: "retire", label: "Version impact", placement: "overflow", run: (context) => context.openOverlay("version impact") },
      ],
      overlays: [
        { id: "Capability inspector", kind: "drawer", title: "Capability", width: 560, render: ({ ...context }) => <CapabilityInspector context={context} /> },
        {
          id: "schema diff", kind: "modal", title: "Mock responses", width: 560,
          render: () => (
            <Notice tone="warning" title="No mock response is offered">
              A mock would produce data that looks like a provider answered. Every surface here would then be showing an invented figure. The registry shows the schema instead, and nothing pretends to return rows.
            </Notice>
          ),
          footer: closeFooter(),
        },
        {
          id: "version impact", kind: "modal", title: "Version impact", width: 560,
          render: ({ ...context }) => (
            <Stack gap={3}>
              <Notice tone="info" title="Raising a contract version is a breaking change for missions">
                A mission names an operation. If the operation's shape changes, every mission that uses it has to be reviewed. That is why the version sits on the contract rather than on the provider.
              </Notice>
              <Button variant="secondary" onClick={() => context.setTab("Versions")}>See the versions</Button>
            </Stack>
          ),
          footer: closeFooter(),
        },
      ],
    },

    "ARL-CONNECT-007": {
      id: "ARL-CONNECT-007",
      title: () => "Synchronisation",
      subtitle: () => "Mappings and rules written before a first sync, so the first one is not improvised.",
      tabs: (["Jobs", "Conflicts", "Schedules", "Data mapping"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <SyncCentre context={context} lens={lens} />,
      })),
      actions: [
        { id: "Retry safe sync", label: "Retry", placement: "primary", run: (context) => context.openOverlay("run receipt") },
        { id: "change mapping", label: "Edit a mapping", placement: "secondary", run: (context) => context.openOverlay("Mapping editor") },
        { id: "inspect conflict", label: "Conflicts", placement: "overflow", run: (context) => context.setTab("Conflicts") },
      ],
      overlays: [
        { id: "Mapping editor", kind: "modal", title: "Mapping", width: 560, render: ({ close, ...context }) => <MappingEditor context={context} close={close} />, footer: submitFooter("mapping-editor", "Record the mapping") },
        { id: "conflict resolver", kind: "drawer", title: "Conflict", width: 520, render: ({ ...context }) => <ConflictResolver context={context} /> },
        { id: "run receipt", kind: "modal", title: "Retry", width: 520, render: ({ ...context }) => <RetryReview context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-008": {
      id: "ARL-CONNECT-008",
      title: () => "Connector health",
      subtitle: () => "Two checks can be made here. The rest would need a provider, and are not attempted.",
      tabs: (["Overview", "Outages", "Rate limits", "Deprecations"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectorHealth context={context} lens={lens} />,
      })),
      actions: [
        { id: "Run health test", label: "Run the health test", placement: "primary", run: (context) => context.setTab("Overview") },
        { id: "open incident", label: "Open an incident", placement: "secondary", run: (context) => context.navigate(`/o/${context.org.slug}/it/incidents`) },
        { id: "contact owner", label: "Mitigation", placement: "overflow", run: (context) => context.openOverlay("mitigation") },
      ],
      overlays: [
        { id: "Health report", kind: "modal", title: "Health report", width: 560, render: ({ ...context }) => <HealthReport context={context} />, footer: closeFooter() },
        { id: "reconnect request", kind: "modal", title: "Reconnect", width: 520, render: ({ ...context }) => <ReconnectDialog context={context} />, footer: closeFooter() },
        { id: "mitigation", kind: "drawer", title: "Mitigation", width: 620, render: ({ ...context }) => <MitigationPanel context={context} /> },
      ],
    },

    "ARL-CONNECT-009": {
      id: "ARL-CONNECT-009",
      title: () => "Custom adapters",
      subtitle: () => "A declaration against the same contract, reviewed by a person before any agent may use it.",
      tabs: (["Projects", "Editor", "Tests", "Publish"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <CustomConnectors context={context} lens={lens} />,
      })),
      actions: [
        { id: "Create adapter", label: "New adapter", placement: "primary", run: (context) => context.setTab("Editor") },
        { id: "test", label: "Contract tests", placement: "secondary", run: (context) => context.setTab("Tests") },
        { id: "register action", label: "Validate a declaration", placement: "overflow", run: (context) => context.openOverlay("capability validation") },
        { id: "submit for use", label: "Submit for approval", placement: "overflow", run: (context) => context.openOverlay("approval") },
      ],
      overlays: [
        {
          id: "Secret setup", kind: "modal", title: "Credentials", tone: "danger", width: 560,
          render: () => (
            <Stack gap={3}>
              <Notice tone="danger" title="No credential field is offered">
                An adapter's credential belongs in an encrypted store on a server. Typed into this browser it would sit in IndexedDB in plain text. Nothing here stores one, and nothing generates one.
              </Notice>
              <Properties rows={[
                { label: "Credentials stored", value: <span className="ds-num">0</span> },
                { label: "Credentials generated", value: <span className="ds-num">0</span> },
                { label: "What an adapter declares instead", value: "The name of the scope it would need" },
              ]} />
            </Stack>
          ),
          footer: closeFooter(),
        },
        {
          id: "capability validation", kind: "drawer", title: "Validation", width: 560,
          render: ({ ...context }) => <CustomConnectors context={context} lens="Tests" />,
        },
        { id: "approval", kind: "modal", title: "Approval", width: 520, render: ({ ...context }) => <ApprovalPanel context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-010": {
      id: "ARL-CONNECT-010",
      title: () => "Action receipts",
      subtitle: () => "What was asked of a provider, and what actually came back, which so far is nothing.",
      tabs: (["All", "Confirmed", "Pending", "Failed", "Blocked"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ActionReceipts context={context} lens={lens} />,
      })),
      actions: [
        { id: "Inspect", label: "Inspect a receipt", placement: "primary", run: (context) => context.openOverlay("Receipt detail") },
        { id: "export", label: "Export", placement: "secondary", capability: "export_data", run: (context) => context.toast("Export is in the table", "Use Export CSV in the toolbar so the file matches the tab you are reading.") },
        { id: "reconcile", label: "Provider evidence", placement: "overflow", run: (context) => context.openOverlay("provider evidence") },
        { id: "open mission", label: "Missions", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/mission/missions`) },
      ],
      overlays: [
        { id: "Receipt detail", kind: "drawer", title: "Receipt", width: 540, render: ({ ...context }) => <ReceiptDetail context={context} /> },
        { id: "provider evidence", kind: "modal", title: "Provider evidence", width: 520, render: () => <ProviderEvidence />, footer: closeFooter() },
        { id: "retry review", kind: "modal", title: "Retry", width: 520, render: ({ ...context }) => <RetryReview context={context} />, footer: closeFooter() },
      ],
    },
  },
});
