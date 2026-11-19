import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ExternalLink, PlugZap, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Button, Notice, Stack } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { BUSINESS_GOALS, SUGGESTED_INTEGRATIONS, type IntegrationGoal } from "./nangoCatalog";
import "./nango-experience.css";

type Status = { available: boolean; integrations: string[]; note?: string };
type ConnectedAccount = { id: string; integrationId: string; provider: string; created: string; needsAttention: boolean };

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
  const status = useNangoReadiness();
  const cards = useMemo(() => {
    const q = query.toLocaleLowerCase().trim();
    const results = SUGGESTED_INTEGRATIONS.filter(item =>
      (all || item.goal === goal) &&
      (!q || [item.name, item.category, item.summary, item.keywords || "", ...item.applications].join(" ").toLocaleLowerCase().includes(q)));
    return results.slice(0, all ? 48 : 6);
  }, [goal, all, query]);

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
          onClick={() => { setGoal(item.id); setAll(false); setQuery(""); }}>
          <span>{item.title}</span><small>{item.detail}</small>
        </button>)}
    </div>
    <div className="connect-guide-searchbar">
      <label className="connect-marketplace-search">
        <Search size={16} aria-hidden="true"/>
        <span className="ds-sr-only">Search suggested software</span>
        <input type="search" aria-label="Search suggested software" placeholder="Find a tool, or search what it helps with…" value={query}
          onChange={event => { setQuery(event.target.value); if (event.target.value.trim()) setAll(true); }} />
      </label>
      <Button size="sm" variant="secondary" onClick={() => { setAll(value => !value); setQuery(""); }}>
        {all ? "Show my suggestions" : "Browse more tools"}
      </Button>
    </div>
    <div className="connect-guide-info" role="status">
      <ShieldCheck size={16} aria-hidden="true"/>
      <span>{status?.available
        ? "Connections are enabled for configured services. We'll always ask before linking an account."
        : "Browse suggested tools now. Secure account connections will be available when company setup is complete."}</span>
    </div>
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
            <span className="connect-guide-state">{enabled ? "Available to connect" : "Explore connection"}</span>
            <button type="button" onClick={() => context.openOverlay("Nango guided setup", { providerId: item.id })}>
              Set up <ArrowRight size={15} aria-hidden="true"/>
            </button>
          </div>
        </article>;
      })}
    </div>
    {cards.length === 0 && <p className="ds-subtle">No suggested tools match. Try a different name or business goal.</p>}
    <p className="connect-guide-disclaimer">Suggested integrations are not automatically active. Availability, permission requirements and supported operations are verified during setup.</p>
  </section>;
}

export function NangoGuidedSetup({ context }: { context: ScreenContext }) {
  const payload = context.overlayPayload as { providerId?: string } | undefined;
  const provider = SUGGESTED_INTEGRATIONS.find(item => item.id === payload?.providerId);
  const status = useNangoReadiness();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [launched, setLaunched] = useState(false);
  const [verified, setVerified] = useState(false);
  const available = Boolean(provider && status?.available && status.integrations.includes(provider.id));
  if (!provider) return <Notice tone="warning" title="Unknown integration">Select a supported integration in the directory.</Notice>;

  const start = async () => {
    if (!available || busy) return;
    // Open synchronously on user action, before the asynchronous session call.
    const popup = window.open("about:blank", "_blank", "width=580,height=730");
    if (popup) { popup.document.title = "Authorising account"; popup.opener = null; }
    setBusy(true); setError("");
    try {
      const result = await readJson<{ connectLink: string }>("/api/integrations/connect-session", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: context.org.id, integrationId: provider.id }),
      });
      const destination = new URL(result.connectLink);
      if (destination.protocol !== "https:") throw new Error("The connection service returned an invalid sign-in address.");
      if (popup && !popup.closed) popup.location.replace(destination.toString());
      else window.open(destination.toString(), "_blank", "noopener,noreferrer");
      setLaunched(true); setStep(2);
    } catch (cause) {
      if (popup && !popup.closed) popup.close();
      setError(cause instanceof Error ? cause.message : "We could not start the secure sign-in.");
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setBusy(true); setError("");
    try {
      const result = await readJson<{ connections: ConnectedAccount[] }>(
        "/api/integrations/connections?organizationId=" + encodeURIComponent(context.org.id));
      const match = result.connections.some(item => item.integrationId === provider.id && !item.needsAttention);
      if (!match) throw new Error("We haven't confirmed the account yet. Finish signing in, then try again.");
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
      {verified && <Notice tone="success" title="Account verified">Authorisation is confirmed. No data sync or external write was automatically activated.</Notice>}
      {error && !verified && <Notice tone="warning" title="Not verified yet">{error}</Notice>}
      {verified ? <Button variant="primary" onClick={() => { context.closeOverlay(); context.navigate("/o/" + context.org.slug + "/connect/connections"); }}>View connections <ArrowRight size={15}/></Button> :
        <Button variant="primary" busy={busy} onClick={verify}><CheckCircle2 size={16}/> Check connection</Button>}
      <Button variant="secondary" onClick={() => context.closeOverlay()}>Done for now</Button>
    </Stack>}
  </Stack>;
}

export function NangoLiveConnections({ context }: { context: ScreenContext }) {
  const [connections, setConnections] = useState<ConnectedAccount[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true); setError("");
    try {
      const response = await readJson<{ connections: ConnectedAccount[] }>(
        "/api/integrations/connections?organizationId=" + encodeURIComponent(context.org.id));
      setConnections(response.connections);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Connections are unavailable."); }
    finally { setBusy(false); }
  };
  // No background polling or fake connection counts.
  return <section className="connect-guide connect-live" aria-label="Nango connections">
    <div className="connect-guide-heading">
      <div><span className="connect-eyebrow">SECURE PROVIDER ACCOUNTS</span><h3>Connected accounts</h3>
        <p>Check accounts authorised through Nango for this company. This is separate from local demo records.</p></div>
      <span className="connect-guide-mark" aria-hidden="true"><PlugZap size={22}/></span>
    </div>
    <Button size="sm" variant="secondary" busy={busy} onClick={load}>Refresh authorised accounts</Button>
    {error && <p className="ds-subtle" role="status">{error}</p>}
    {connections && <div className="connect-live-list">
      {connections.length === 0 ? <p className="ds-subtle">No provider accounts have been authorised for this company.</p> :
        connections.map(item => <div key={String(item.id)} className="connect-live-account">
          <div><strong>{String(item.provider || item.integrationId)}</strong><small>Account {String(item.id)}</small></div>
          <span>{item.needsAttention ? "Needs attention" : "Authorised"}</span>
        </div>)}
    </div>}
  </section>;
}
