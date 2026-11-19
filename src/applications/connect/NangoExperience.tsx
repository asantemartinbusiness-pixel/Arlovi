import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, PlugZap, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Notice, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { BUSINESS_GOALS, SUGGESTED_INTEGRATIONS, type IntegrationGoal, type SuggestedIntegration } from "./nangoCatalog";
import "./nango-experience.css";

type Status = { available: boolean; cloudRegistry?: boolean; integrations: string[]; note?: string };
type ConnectedAccount = { id: string; integrationId: string; provider: string; created: string; needsAttention: boolean; ownedByMe: boolean };
type ConnectionPage = { connections: ConnectedAccount[]; page: number; nextPage: number | null };

async function getOwnedConnections(organizationId: string, integrationId: string): Promise<ConnectedAccount[]> {
  const result: ConnectedAccount[] = [];
  for (let page = 1; page <= 15; page++) {
    const params = new URLSearchParams({ organizationId, integrationId, owner: "mine", page: String(page) });
    const batch = await readJson<ConnectionPage>("/api/integrations/connections?" + params);
    result.push(...batch.connections.filter(item => item.integrationId === integrationId && item.ownedByMe));
    if (!batch.nextPage) return result;
  }
  // A partial account list cannot safely confirm a new authorisation.
  throw new Error("This company has too many accounts to verify here. Ask an administrator to review them.");
}

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  const body: unknown = await response.json();
  if (!response.ok) {
    const payload = body as { message?: string; error?: string };
    throw new Error(payload.message || payload.error || "The connection service could not complete this request.");
  }
  return body as T;
}

function useNangoReadiness() {
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    let live = true;
    readJson<Status>("/api/integrations/status")
      .then(value => { if (live) setStatus(value); })
      .catch(() => { if (live) setStatus({ available: false, integrations: [], note: "Secure connections are not available in this environment." }); });
    return () => { live = false; };
  }, []);
  return status;
}

export function GuidedMarketplace({ context }: { context: ScreenContext }) {
  const [goal, setGoal] = useState<IntegrationGoal>("sell");
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const [nangoProviders, setNangoProviders] = useState<SuggestedIntegration[]>([]);
  const [nangoTotal, setNangoTotal] = useState(0);
  const [nangoPage, setNangoPage] = useState(1);
  const [nextNangoPage, setNextNangoPage] = useState<number | null>(null);
  const status = useNangoReadiness();
  useEffect(() => {
    if (!all || !status?.available) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      readJson<{ providers: { id: string; name: string; categories: string[] }[]; total: number; nextPage: number | null }>(
        "/api/integrations/providers?q=" + encodeURIComponent(query) + "&page=" + nangoPage, { signal: controller.signal })
        .then(result => {
          setNangoTotal(result.total);
          setNextNangoPage(result.nextPage);
          const fresh = result.providers.map(item => {
            const cats = item.categories.map(value => value.toLowerCase());
            const category = cats.some(value => /financ|account|payment/.test(value)) ? "Finance" :
              cats.some(value => /commerce|retail/.test(value)) ? "Commerce" :
              cats.some(value => /crm|sales/.test(value)) ? "CRM" :
              cats.some(value => /mail|messag|communication/.test(value)) ? "Communication" : "Work";
            return {
              id: item.id, name: item.name, category, goal: "organise",
              summary: "Explore account access. Available actions and syncs must be verified separately.",
              applications: ["Integrations"],
            } as SuggestedIntegration;
          });
          setNangoProviders(previous => nangoPage === 1
            ? fresh
            : [...previous, ...fresh.filter(item => !previous.some(existing => existing.id === item.id))]);
        })
        .catch(() => { if (!controller.signal.aborted) setNangoProviders([]); });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [all, query, nangoPage, status?.available]);
  const cards = useMemo(() => {
    const q = query.toLocaleLowerCase().trim();
    const merged = all
      ? [...SUGGESTED_INTEGRATIONS, ...nangoProviders.filter(item => !SUGGESTED_INTEGRATIONS.some(existing => existing.id === item.id))]
      : SUGGESTED_INTEGRATIONS;
    return merged.filter(item =>
      (all || item.goal === goal) &&
      (!q || [item.name, item.category, item.summary, item.keywords || "", ...item.applications].join(" ").toLocaleLowerCase().includes(q)))
      .slice(0, all ? 1200 : 6);
  }, [goal, all, query, nangoProviders]);

  return <section className="connect-guide" aria-label="Guided integration setup">
    <div className="connect-guide-heading">
      <div>
        <span className="connect-eyebrow">A SIMPLER WAY TO GET CONNECTED</span>
        <h3>What would you like Arlovi to help with?</h3>
        <p>Choose a goal and discover tools that fit your business. You can still explore every technical capability below.</p>
      </div>
      <span className="connect-guide-mark" aria-hidden="true"><Sparkles size={22}/></span>
    </div>
    <div className="connect-guide-goals" role="group" aria-label="Business goals">
      {BUSINESS_GOALS.map(item =>
        <button type="button" key={item.id} aria-pressed={goal === item.id && !all}
          onClick={() => { setGoal(item.id); setAll(false); setQuery(""); setNangoPage(1); }}>
          <span>{item.title}</span><small>{item.detail}</small>
        </button>)}
    </div>
    <div className="connect-guide-searchbar">
      <label className="connect-marketplace-search">
        <Search size={16} aria-hidden="true"/>
        <span className="ds-sr-only">Search suggested software</span>
        <input type="search" aria-label="Search suggested software" placeholder="Find a tool, or search what it helps with…" value={query}
          onChange={event => { setQuery(event.target.value); setNangoPage(1); setNangoProviders([]); if (event.target.value.trim()) setAll(true); }} />
      </label>
      <Button size="sm" variant="secondary" onClick={() => { setAll(value => !value); setQuery(""); setNangoPage(1); setNangoProviders([]); }}>
        {all ? "Show my suggestions" : "Browse more tools"}
      </Button>
    </div>
    <div className="connect-guide-info" role="status">
      <ShieldCheck size={16} aria-hidden="true"/>
      <span>{status?.available
        ? "Secure setup is configured for selected services. Account authorisation still requires verification."
        : "Browse suggested tools now. Secure account connections will be available when company setup is complete."}</span>
    </div>
    {all && status?.available && <p className="connect-guide-disclaimer">Browse Nango provider metadata · {nangoTotal} matching providers · individual actions and account permissions require verification.</p>}
    <div className="connect-guide-cards" aria-label="Suggested business integrations">
      {cards.map(item => {
        const enabled = Boolean(status?.available && status.integrations.includes(item.id));
        return <article className="connect-guide-card" key={item.id}>
          <div className="connect-guide-card-top">
            <span className="connect-guide-avatar" aria-hidden="true">{item.name.slice(0, 1)}</span>
            <span className="connect-guide-category">{item.category}</span>
          </div>
          <h4>{item.name}</h4>
          <p>{item.summary}</p>
          <div className="connect-guide-apps">{item.applications.join(" · ")}</div>
          <div className="connect-guide-card-footer">
            <span className="connect-guide-state">{enabled ? "Setup enabled" : "Explore connection"}</span>
            <button type="button" onClick={() => context.openOverlay("Nango guided setup", { providerId: item.id, provider: item })}>
              Set up <ArrowRight size={15} aria-hidden="true"/>
            </button>
          </div>
        </article>;
      })}
    </div>
    {cards.length === 0 && <p className="ds-subtle">No suggested tools match. Try a different name or business goal.</p>}
    {all && nextNangoPage && <Button size="sm" variant="secondary"
      onClick={() => setNangoPage(nextNangoPage)}>Show more tools</Button>}
    <p className="connect-guide-disclaimer">Suggested integrations are not automatically active. Availability, permission requirements and supported operations are verified during setup.</p>
  </section>;
}

export function NangoGuidedSetup({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { providerId?: string; provider?: SuggestedIntegration } | undefined;
  const selected = payload?.provider;
  const provider = SUGGESTED_INTEGRATIONS.find(item => item.id === payload?.providerId) ??
    (selected && selected.id === payload?.providerId && /^[a-z0-9][a-z0-9_-]{1,95}$/i.test(selected.id) ? selected : undefined);
  const status = useNangoReadiness();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [launched, setLaunched] = useState(false);
  const [verified, setVerified] = useState(false);
  const [previousIds, setPreviousIds] = useState<string[] | null>(null);
  const [popupBlockedLink, setPopupBlockedLink] = useState<string | null>(null);
  const available = Boolean(provider && status?.available && status.integrations.includes(provider.id));
  if (!provider) return <Notice tone="warning" title="Unknown integration">Select a supported integration in the directory.</Notice>;

  const start = async () => {
    if (!available || busy) return;
    // Open synchronously on user action, before the asynchronous session call.
    const popup = window.open("about:blank", "_blank", "width=580,height=730");
    if (popup) { popup.document.title = "Authorising account"; popup.opener = null; }
    setBusy(true); setError(""); setPopupBlockedLink(null);
    try {
      // A preflight snapshot prevents an older account from being mistaken for
      // a successful NEW connection. The backend checks current user ownership.
      const previouslyConnected = await getOwnedConnections(context.org.id, provider.id);
      setPreviousIds(previouslyConnected.map(item => item.id));
      const result = await readJson<{ connectLink: string }>("/api/integrations/connect-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: context.org.id, integrationId: provider.id }),
      });
      const destination = new URL(result.connectLink);
      if (destination.protocol !== "https:") throw new Error("The connection service returned an invalid sign-in address.");
      if (popup && !popup.closed) {
        popup.location.replace(destination.toString());
        setLaunched(true);
      } else {
        // Browsers can block windows after asynchronous session creation.
        // Offer a user-clicked link rather than silently dropping the flow.
        setPopupBlockedLink(destination.toString());
      }
      setStep(2);
    } catch (cause) {
      if (popup && !popup.closed) popup.close();
      setError(cause instanceof Error ? cause.message : "We could not start the secure sign-in.");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError("");
    try {
      if (!previousIds) throw new Error("Start a new secure connection before verifying the result.");
      const accounts = await getOwnedConnections(context.org.id, provider.id);
      const before = new Set(previousIds);
      const match = accounts.some(item => !before.has(item.id) && !item.needsAttention);
      if (!match) throw new Error("We haven't confirmed a newly linked account yet. Finish signing in, then try again.");
      setVerified(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not verify your account.");
    } finally { setBusy(false); }
  };

  return <Stack gap={3}>
    <div className="connect-setup-intro">
      <span className="connect-guide-avatar" aria-hidden="true">{provider.name.slice(0,1)}</span>
      <div><h3>Connect {provider.name}</h3><p>{provider.summary}</p></div>
    </div>
    <div className="connect-setup-progress" role="group" aria-label="Connection setup progress">
      {["Understand", "Connect", "Confirm"].map((name, index) =>
        <button type="button" key={name} aria-current={step === index ? "step" : undefined}
          onClick={() => { if (index !== 2 || launched) setStep(index); }}>
          <span>{index + 1}</span>{name}
        </button>)}
    </div>
    {step === 0 && <Stack gap={3}>
      <h4>Start with a safe connection</h4>
      <p className="ds-prose">Arlovi will not import records or change anything in your external account simply because you connect it.</p>
      <div className="connect-setup-summary">
        <div><strong>Business account</strong><span>{context.org.name}</span></div>
        <div><strong>Where it may be useful</strong><span>{provider.applications.join(", ")}</span></div>
        <div><strong>Initial data changes</strong><span>None. Activation requires a separate approval.</span></div>
      </div>
      <Notice tone="info" title="You're in control">The external provider will ask you to approve its actual account permissions. Arlovi will not grant an AI employee write access by default.</Notice>
      <Button variant="primary" onClick={() => setStep(1)}>Continue <ArrowRight size={15}/></Button>
    </Stack>}
    {step === 1 && <Stack gap={3}>
      <h4>Authorise your {provider.name} account</h4>
      <p className="ds-prose">A secure sign-in window will open. You can cancel without changing your Arlovi records.</p>
      {!available && <Notice tone="warning" title="This connection isn't ready yet">
        {status?.available ? "This provider needs to be configured and verified before connection is enabled." :
          "Arlovi's secure connection service needs to be configured before accounts can be linked."}
      </Notice>}
      {error && <Notice tone="danger" title="Connection could not start">{error}</Notice>}
      <Button variant="primary" disabled={!available || busy} busy={busy} onClick={start}>
        <ExternalLink size={16}/> Connect securely
      </Button>
      <Button variant="secondary" onClick={() => setStep(0)}>Back to overview</Button>
    </Stack>}
    {step === 2 && <Stack gap={3}>
      <h4>{verified ? "Your account is authorised" : "Finish signing in, then confirm"}</h4>
      <p className="ds-prose">{verified
        ? "The account now appears in Nango's connection register. Data imports and actions must still be enabled and verified separately."
        : "Once you approve access in the sign-in window, return here to verify that the account was linked."}</p>
      {popupBlockedLink && !verified && <Notice tone="info" title="Your browser blocked the sign-in window">
        <a href={popupBlockedLink} target="_blank" rel="noopener noreferrer"
          onClick={() => setLaunched(true)}>Open the secure sign-in page</a>, then return here to check your connection.
      </Notice>}
      {verified && <Notice tone="success" title="Account verified">Authorisation is confirmed. No data sync or external write was automatically activated.</Notice>}
      {error && !verified && <Notice tone="warning" title="Not verified yet">{error}</Notice>}
      {verified ? <Button variant="primary" onClick={() => { context.closeOverlay(); context.navigate("/o/" + context.org.slug + "/connect/connections"); }}>View connections <ArrowRight size={15}/></Button> :
        <Button variant="primary" disabled={!launched} busy={busy} onClick={verify}><CheckCircle2 size={16}/> Check connection</Button>}
      <Button variant="secondary" onClick={() => context.closeOverlay()}>Done for now</Button>
    </Stack>}
  </Stack>;
}

export function NangoLiveConnections({ context }: { context: ScreenContext }) {
  const status = useNangoReadiness();
  const [connections, setConnections] = useState<ConnectedAccount[] | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const load = async (page = 1) => {
    if (!status?.available) return;
    setBusy(true); setError(""); setInfo("");
    try {
      const params = new URLSearchParams({ organizationId: context.org.id, page: String(page) });
      const result = await readJson<ConnectionPage>("/api/integrations/connections?" + params);
      setConnections(previous => page === 1 ? result.connections : [...(previous || []), ...result.connections]);
      setNextPage(result.nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connections are unavailable."); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (status?.available) void load(1);
    // Only when readiness/org changes; no polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.available, context.org.id]);

  const reconnect = async (account: ConnectedAccount) => {
    if (busy) return;
    const popup = window.open("about:blank", "_blank", "width=580,height=730");
    if (popup) { popup.document.title = "Reconnect account"; popup.opener = null; }
    setBusy(true); setError(""); setInfo("");
    try {
      const result = await readJson<{ connectLink: string }>("/api/integrations/reconnect-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: context.org.id, connectionId: account.id, integrationId: account.integrationId }),
      });
      const destination = new URL(result.connectLink);
      if (destination.protocol !== "https:") throw new Error("Invalid sign-in destination.");
      if (popup && !popup.closed) popup.location.replace(destination.toString());
      else window.open(destination.toString(), "_blank", "noopener,noreferrer");
      setInfo("Complete the account sign-in, then refresh to check its status.");
    } catch (cause) {
      if (popup && !popup.closed) popup.close();
      setError(cause instanceof Error ? cause.message : "Could not open account reconnection.");
    } finally { setBusy(false); }
  };

  return <section className="connect-guide connect-live" aria-label="Nango connections">
    <div className="connect-guide-heading">
      <div><span className="connect-eyebrow">SECURE PROVIDER ACCOUNTS</span><h3>Connected accounts</h3>
        <p>Review accounts authorised through Nango for this company, separately from local workspace records.</p></div>
      <span className="connect-guide-mark" aria-hidden="true"><PlugZap size={22}/></span>
    </div>
    {!status?.available && <Notice tone="info" title="Secure connections are not enabled here">
      Company authentication and Nango environment setup are required before real accounts can be viewed.
    </Notice>}
    {status?.available && <Button size="sm" variant="secondary" busy={busy} onClick={() => void load(1)}>Refresh authorised accounts</Button>}
    {error && <p className="ds-subtle" role="alert">{error}</p>}
    {info && <p className="ds-subtle" role="status">{info}</p>}
    {connections && <div className="connect-live-list">
      {connections.length === 0 ? <p className="ds-subtle">No provider accounts have been authorised for this company.</p> :
        connections.map(item => <div key={item.integrationId + ":" + item.id} className="connect-live-account">
          <div><strong>{item.provider || item.integrationId}</strong><small>Account {item.id}</small>
            <small>{item.needsAttention ? "Needs attention" : "Authorised · data sync not automatically enabled"}</small></div>
          <Button size="sm" variant="secondary" busy={busy} onClick={() => void reconnect(item)}>{item.needsAttention ? "Fix connection" : "Re-authorise"}</Button>
        </div>)}
      {nextPage && <Button size="sm" variant="secondary" busy={busy} onClick={() => void load(nextPage)}>Show more accounts</Button>}
    </div>}
    {status?.cloudRegistry && <ArloviActivationPanel context={context} />}
  </section>;
}


type RegistryAccount = {
  id: string; providerName: string; integrationId: string; connectionName: string;
  ownership: "personal" | "organization" | "department";
  status: "pending" | "authorised" | "needs_attention" | "suspended" | "disconnected";
  activation: "inactive" | "read_only" | "approved_writes";
  syncHealth: "not_configured" | "healthy" | "degraded" | "failed";
  readVerifiedAt: string | null; updatedAt: string; needsAttention: boolean;
};

export function ArloviActivationPanel({ context }: { context: ScreenContext }) {
  const [records, setRecords] = useState<RegistryAccount[] | null>(null);
  const [nextPage, setNextPage] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // A company switch must never retain another company's metadata.
    setRecords(null);
    setNextPage(null);
    setError("");
  }, [context.org.id]);

  const refresh = async (page = 1) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const params = new URLSearchParams({ organizationId: context.org.id, page: String(page) });
      const result = await readJson<{ connections: RegistryAccount[]; nextPage: number | null }>(
        "/api/integrations/registry?" + params);
      setRecords(previous => page === 1 ? result.connections : [...(previous ?? []), ...result.connections]);
      setNextPage(result.nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your activation records could not be loaded.");
    } finally { setBusy(false); }
  };
  const activationLabels: Record<RegistryAccount["activation"], string> = {
    inactive: "Not activated", read_only: "Read-only", approved_writes: "Approved writes",
  };
  return <div className="connect-activation" aria-label="Arlovi connection activation">
    <div>
      <h4>What Arlovi can use</h4>
      <p className="ds-subtle">Account sign-in, verified data access and synchronisation are separate. Only approved operations become available inside your apps.</p>
    </div>
    <Button size="sm" variant="secondary" busy={busy} onClick={() => void refresh(1)}>Review activation</Button>
    {error && <Notice tone="warning" title="Activation records unavailable">
      {error === "NOT_AUTHORISED" ? "Sign in with your company's verified cloud account to review integration settings." : error}
    </Notice>}
    {records && <div className="connect-live-list">
      {records.length === 0 && <p className="ds-subtle">No activated connections are recorded in Arlovi Cloud for this company.</p>}
      {records.map(record => <div key={record.id} className="connect-live-account">
        <div>
          <strong>{record.connectionName || record.providerName}</strong>
          <small>{record.ownership} account · {record.status.replace(/_/g, " ")}</small>
          <small>Sync: {record.syncHealth.replace(/_/g, " ")}</small>
        </div>
        <span className="connect-guide-state">{activationLabels[record.activation]}</span>
      </div>)}
      {nextPage && <Button size="sm" variant="secondary" busy={busy} onClick={() => void refresh(nextPage)}>Show more accounts</Button>}
    </div>}
  </div>;
}
