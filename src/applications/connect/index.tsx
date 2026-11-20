import { Boxes, HeartPulse, Plug, Receipt, RefreshCcw, Shapes, Wand2 } from "lucide-react";
import { registerApp, type ScreenContext } from "@/platform/registry";
import { closeFooter, submitFooter } from "@/applications/t6kit/kit";
import {
  ActionReceipts, CapabilityInspector, CapabilityRegistry, ConnectionDetail,
  ConnectionWizard, Connections, ConnectorDetail, ConnectorHealth, ConnectorPreview, ConsentStatus,
  CustomConnectors, ExternalOAuth, MappingEditor, Marketplace, ProviderEvidence, ReceiptDetail,
  RetryReview, RevokeGrant, RiskSummary, ScopeReview, SyncCentre, openConnector, useConnector,
} from "./panels";
import { CONNECTOR_ENTRIES } from "./catalog";
import { connectorRecordHeader } from "./recordHeads";
import { connectorSummary } from "./overlayHeads";
import { NangoGuidedSetup } from "./NangoExperience";
import { Button, FactGrid, Notice, OVERLAY_WIDTH, OverlaySection, Stack } from "@/design-system";
import { openAct } from "@/applications/t6kit/act";
import {
  CompareConnectors, ProviderLimits, SchemaDiff, attemptAuthorisation, cancelAuthorisation, chooseTargetsOverlay,
  contactOwner, createAdapter, disableOverlay, exportReceipts, installConnector, limitAgentsOverlay, openConnectorIncident,
  openMission, reconcileReceipts, reconnectConnection, registerAction, requestCapability, resolveConflict, retireOperation,
  retrySync, rotateAuth, runAdapterTests, runHealthTest, submitAdapter, testConnection, testMock, transferOwner,
} from "./actions";

/* ====================================================================== *
 * CONNECT — Integrations & Connectors
 * Every provider in src/platform/capability.ts is listed with what it
 * would enable, the scopes it would request, its state (not connected,
 * every one) and what Arlovi does locally instead. The authorisation flow
 * walks to the point where it cannot continue and says why.
 * ====================================================================== */


function ScopeChangePanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="A scope cannot be changed without a grant">
        Widening or narrowing access means asking the provider again. With no grant, there is nothing to re-ask about.
      </Notice>
      <FactGrid items={[
        { label: "Scopes granted", value: "0", mono: true },
        { label: "A change would need", value: "A fresh authorisation, approved by the account holder" },
      ]} />
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/marketplace`)}>Back to the directory</Button>
    </Stack>
  );
}

function ReconnectDialog({ context }: { context: ScreenContext }) {
  const { records, entry } = useConnector(context);
  return (
    <Stack gap={4}>
      <Notice tone="warning" title="Reconnecting is the flow that cannot complete">
        There is no previous connection to restore. Reconnect and connect are the same action, and both stop before the provider redirect.
      </Notice>
      <Button variant="secondary" onClick={() => { context.closeOverlay(); openConnector(context, records, entry ?? CONNECTOR_ENTRIES[0], "connect"); }}>
        Open the authorisation flow
      </Button>
    </Stack>
  );
}

function HealthReport({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <FactGrid columns={4} items={[
        { label: "In the register", value: String(CONNECTOR_ENTRIES.length), mono: true },
        { label: "Connected", value: "0", mono: true },
        { label: "Local checks passed", value: "2", mono: true, tone: "success" },
        { label: "Need a provider", value: "3", mono: true, tone: "warning" },
      ]} />
      <OverlaySection title="What was attempted" hint="Two checks read the register and the connector records in this browser. Three would need a network call, and were not attempted rather than failed.">
        Nothing external was called, so no provider health is claimed either way.
      </OverlaySection>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/connect/receipts`)}>Read the receipts</Button>
    </Stack>
  );
}

function MitigationPanel({ context }: { context: ScreenContext }) {
  return (
    <Stack gap={4}>
      <OverlaySection title="What can be done without the provider" hint="Every capability has a local equivalent; those are what the workspace runs on now. The list is the mitigation." flush>
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
      </OverlaySection>
      <Button variant="secondary" onClick={() => context.navigate(`/o/${context.org.slug}/it/incidents`)}>Open the incident queue</Button>
    </Stack>
  );
}


export const connectApp = registerApp({
  code: "CONNECT",
  short: "Integrations",
  name: "Integrations & Connectors",
  purpose: "Discover business tools, connect authorised accounts and manage provider capabilities",
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
      subtitle: () => "Find the right tools for your business, with clear availability and permission requirements.",
      tabs: (["Featured", "Categories", "Installed", "Custom"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <Marketplace context={context} lens={lens} />,
      })),
      actions: [
        { id: "Browse", label: "Browse by category", placement: "primary", run: (context) => context.setTab("Categories") },
        { id: "inspect requirements", label: "Inspect requirements", placement: "secondary", run: (context) => context.openOverlay("Connector preview") },
        { id: "compare", label: "Compare connectors", placement: "overflow", run: (context) => context.openOverlay("compare connectors") },
        { id: "install", label: "Install", placement: "overflow", run: (context) => context.openOverlay("install wizard") },
        { id: "capability registry", label: "Capability registry", placement: "overflow", run: (context) => context.navigate(`/o/${context.org.slug}/connect/capabilities`) },
      ],
      overlays: [
        { id: "Connector preview", kind: "drawer", title: "Connector", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ ...context }) => <ConnectorPreview context={context} /> },
        { id: "Nango guided setup", kind: "drawer", title: "Connect your software", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <NangoGuidedSetup context={context} /> },
        installConnector,
        { id: "compare connectors", kind: "modal", title: "Compare connectors", width: 820, render: ({ ...context }) => <CompareConnectors context={context} />, footer: closeFooter() },
        { id: "risk summary", kind: "modal", title: "Risk", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <RiskSummary context={context} />, footer: closeFooter() },
      ],
    },

    "ARL-CONNECT-002": {
      id: "ARL-CONNECT-002",
      title: () => "Connector",
      record: (context) => connectorRecordHeader(context, "connector"),
      tabs: (["Overview", "Capabilities", "Permissions", "Versions", "Help"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectorDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "Connect", label: "Connect", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/connect/connect/${context.params.id ?? CONNECTOR_ENTRIES[0].capability.id}`) },
        { id: "test", label: "Test the connection", placement: "secondary", run: (context) => context.openOverlay("test connection") },
        { id: "view docs", label: "View the documentation", placement: "overflow", run: (context) => context.setTab("Help") },
        { id: "request capability", label: "Request a capability", placement: "overflow", run: (context) => context.openOverlay("request capability") },
        { id: "authorisation preview", label: "Authorisation preview", placement: "overflow", run: (context) => context.openOverlay("Authorization preview") },
        { id: "provider limits", label: "Provider limits", placement: "overflow", run: (context) => context.openOverlay("provider limits") },
        { id: "scopes explained", label: "Scopes explained", placement: "overflow", run: (context) => context.openOverlay("scope explanation") },
      ],
      overlays: [
        { id: "Authorization preview", kind: "drawer", title: "Authorisation", width: OVERLAY_WIDTH.form, summary: connectorSummary("Authorisation preview"), capability: "manage_connectors", presentation: { guidance: "Review provider access scopes, account identity and connection status; an unconnected provider cannot be authorised here." }, render: ({ ...context }) => <ExternalOAuth context={context} /> },
        { id: "scope explanation", kind: "drawer", title: "Scopes", width: OVERLAY_WIDTH.form, summary: connectorSummary("Scopes"), render: ({ ...context }) => <ScopeReview context={context} /> },
        { id: "provider limits", kind: "modal", title: "Provider limits", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <ProviderLimits context={context} />, footer: closeFooter() },
        testConnection, requestCapability,
      ],
    },

    "ARL-CONNECT-003": {
      id: "ARL-CONNECT-003",
      title: () => "Authorise a connector",
      record: (context) => connectorRecordHeader(context, "authorise"),
      tabs: (["Account", "Permissions", "Test", "Confirm"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectionWizard context={context} lens={lens} />,
      })),
      actions: [
        { id: "Authorize", label: "Authorise", placement: "primary", run: (context) => context.openOverlay("External OAuth") },
        { id: "choose targets", label: "Choose the scopes to request", placement: "secondary", run: (context) => context.openOverlay("choose targets") },
        { id: "test", label: "Test the connection", placement: "overflow", run: (context) => context.openOverlay("test connection") },
        { id: "cancel", label: "Cancel and leave it unconnected", placement: "overflow", run: (context) => context.openOverlay("cancel authorisation") },
        { id: "consent record", label: "Consent record", placement: "overflow", run: (context) => context.openOverlay("consent status") },
      ],
      overlays: [
        attemptAuthorisation, chooseTargetsOverlay(), testConnection, cancelAuthorisation,
        { id: "scope review", kind: "drawer", title: "Scopes", width: OVERLAY_WIDTH.form, summary: connectorSummary("Scopes"), render: ({ ...context }) => <ScopeReview context={context} /> },
        { id: "consent status", kind: "drawer", title: "Consent", width: OVERLAY_WIDTH.form, summary: connectorSummary("Consent record"), render: ({ ...context }) => <ConsentStatus context={context} /> },
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
        { id: "reconnect", label: "Reconnect", placement: "secondary", run: openAct("reconnect") },
        { id: "suspend", label: "Suspend", placement: "overflow", tone: "danger", run: openAct("suspend connection") },
        { id: "transfer owner", label: "Transfer owner", placement: "overflow", run: openAct("transfer owner") },
        { id: "scope change", label: "Scope change", placement: "overflow", run: (context) => context.openOverlay("scope change") },
        { id: "revoke", label: "Revoke", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("revoke grant") },
      ],
      overlays: [
        { id: "Account inspector", kind: "drawer", title: "Account", width: OVERLAY_WIDTH.form, summary: connectorSummary("Account"), render: ({ ...context }) => <ConsentStatus context={context} /> },
        { id: "scope change", kind: "modal", title: "Change scopes", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ScopeChangePanel context={context} />, footer: closeFooter() },
        { id: "revoke grant", kind: "modal", title: "Revoke", tone: "danger", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <RevokeGrant context={context} />, footer: closeFooter() },
        reconnectConnection, transferOwner, disableOverlay("suspend connection", "Suspend", "suspended"),
      ],
    },

    "ARL-CONNECT-005": {
      id: "ARL-CONNECT-005",
      title: () => "Connection",
      record: (context) => connectorRecordHeader(context, "connection"),
      tabs: (["Overview", "Capabilities", "Sync", "Activity", "Security"] as const).map((lens) => ({
        id: lens,
        render: (context: ScreenContext) => <ConnectionDetail context={context} lens={lens} />,
      })),
      actions: [
        { id: "set up", label: "Set up the connection", placement: "primary", run: (context) => context.navigate(`/o/${context.org.slug}/connect/connect/${context.params.id}`) },
        { id: "Test", label: "Test this connection", placement: "overflow", run: (context) => context.openOverlay("test connection") },
        { id: "limit agents", label: "Limit what agents may use", placement: "secondary", run: (context) => context.openOverlay("limit agents") },
        { id: "rotate auth", label: "Rotate the authorisation", placement: "overflow", run: (context) => context.openOverlay("rotate auth") },
        { id: "disable", label: "Disable", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("disable connection") },
        { id: "revoke", label: "Revoke", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("revoke grant") },
      ],
      overlays: [
        { id: "Permission matrix", kind: "drawer", title: "Permissions", width: OVERLAY_WIDTH.record, summary: connectorSummary("Permissions"), render: ({ ...context }) => <ConnectorDetail context={context} lens="Permissions" /> },
        { id: "health run", kind: "modal", title: "Health test", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <HealthReport context={context} />, footer: closeFooter() },
        { id: "reconnect dialog", kind: "modal", title: "Reconnect", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ReconnectDialog context={context} />, footer: closeFooter() },
        { id: "revoke grant", kind: "modal", title: "Revoke", tone: "danger", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <RevokeGrant context={context} />, footer: closeFooter() },
        testConnection, limitAgentsOverlay(), rotateAuth, disableOverlay("disable connection", "Disable", "disabled"),
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
        { id: "compare", label: "Compare schemas", placement: "secondary", run: (context) => context.openOverlay("schema diff") },
        { id: "test mock", label: "Test against the mock", placement: "overflow", run: (context) => context.openOverlay("test mock") },
        { id: "retire", label: "Retire an operation", placement: "overflow", tone: "danger", run: (context) => context.openOverlay("version impact") },
        { id: "versions", label: "Versions", placement: "overflow", run: (context) => context.setTab("Versions") },
      ],
      overlays: [
        { id: "Capability inspector", kind: "drawer", title: "Capability", width: OVERLAY_WIDTH.form, presentation: { noRecordContext: true }, render: ({ ...context }) => <CapabilityInspector context={context} /> },
        { id: "schema diff", kind: "modal", title: "Schema diff", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <SchemaDiff context={context} />, footer: closeFooter() },
        testMock, retireOperation,
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
        { id: "Retry safe sync", label: "Retry a safe sync", placement: "primary", run: (context) => context.openOverlay("run receipt") },
        { id: "change mapping", label: "Change a mapping", placement: "secondary", run: (context) => context.openOverlay("Mapping editor") },
        { id: "inspect conflict", label: "Inspect a conflict", placement: "overflow", run: (context) => { context.setTab("Conflicts"); context.openOverlay("conflict resolver"); } },
      ],
      overlays: [
        { id: "Mapping editor", kind: "modal", title: "Mapping", width: OVERLAY_WIDTH.modal, render: ({ close, ...context }) => <MappingEditor context={context} close={close} />, footer: submitFooter("mapping-editor", "Record the mapping") },
        resolveConflict, retrySync,
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
        { id: "Run health test", label: "Run the health test", placement: "primary", run: (context) => runHealthTest(context) },
        { id: "open incident", label: "Open an incident", placement: "secondary", run: (context) => context.openOverlay("open incident") },
        { id: "contact owner", label: "Contact the owner", placement: "overflow", run: (context) => context.openOverlay("contact owner") },
        { id: "mitigation", label: "Mitigation", placement: "overflow", run: (context) => context.openOverlay("mitigation") },
      ],
      overlays: [
        { id: "Health report", kind: "modal", title: "Health report", width: OVERLAY_WIDTH.modal, render: ({ ...context }) => <HealthReport context={context} />, footer: closeFooter() },
        { id: "reconnect request", kind: "modal", title: "Reconnect", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ReconnectDialog context={context} />, footer: closeFooter() },
        { id: "mitigation", kind: "drawer", title: "Mitigation", width: OVERLAY_WIDTH.record, render: ({ ...context }) => <MitigationPanel context={context} /> },
        openConnectorIncident, contactOwner,
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
        { id: "Create adapter", label: "Create an adapter", placement: "primary", run: (context) => context.openOverlay("create adapter") },
        { id: "test", label: "Run the contract tests", placement: "secondary", run: (context) => context.openOverlay("contract tests") },
        { id: "register action", label: "Register an operation", placement: "overflow", run: (context) => context.openOverlay("capability validation") },
        { id: "submit for use", label: "Submit for approval", placement: "overflow", run: (context) => context.openOverlay("approval") },
        { id: "editor", label: "Draft in the editor", placement: "overflow", run: (context) => context.setTab("Editor") },
      ],
      overlays: [
        {
          id: "Secret setup", kind: "modal", title: "Credentials", tone: "danger", width: OVERLAY_WIDTH.modal,
          render: () => (
            <Stack gap={4}>
              <Notice tone="danger" title="No credential field is offered">
                An adapter's credential belongs in an encrypted store on a server. Typed into this browser it would sit in IndexedDB in plain text. Nothing here stores one, and nothing generates one.
              </Notice>
              <FactGrid columns={3} items={[
                { label: "Credentials stored", value: "0", mono: true },
                { label: "Credentials generated", value: "0", mono: true },
                { label: "An adapter declares", value: "The name of the scope it needs" },
              ]} />
            </Stack>
          ),
          footer: closeFooter(),
        },
        registerAction, submitAdapter, createAdapter, runAdapterTests,
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
        { id: "export", label: "Export", placement: "secondary", capability: "export_data", run: (context) => exportReceipts(context) },
        { id: "reconcile", label: "Reconcile", placement: "overflow", run: (context) => context.openOverlay("reconcile receipts") },
        { id: "open mission", label: "Open the mission", placement: "overflow", run: (context) => context.openOverlay("open mission") },
        { id: "provider evidence", label: "Provider evidence", placement: "overflow", run: (context) => context.openOverlay("provider evidence") },
      ],
      overlays: [
        { id: "Receipt detail", kind: "drawer", title: "Receipt", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <ReceiptDetail context={context} /> },
        { id: "provider evidence", kind: "modal", title: "Provider evidence", width: OVERLAY_WIDTH.form, render: () => <ProviderEvidence />, footer: closeFooter() },
        { id: "retry review", kind: "modal", title: "Retry", width: OVERLAY_WIDTH.form, render: ({ ...context }) => <RetryReview context={context} />, footer: closeFooter() },
        reconcileReceipts, openMission,
      ],
    },
  },
});
