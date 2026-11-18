import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, ChevronRight, KeyRound, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { ArloviMark } from "@/app/brand";
import { ORGS } from "@/platform/org";
import "./entry-experience.css";

export type EntryMode = "welcome" | "sign-in" | "sign-up" | "recover" | "verify" | "security" | "invite";

const COPY: Record<EntryMode, { eyebrow: string; title: string; description: string }> = {
  welcome: { eyebrow: "YOUR WORK STARTS HERE", title: "A better way to run your business.", description: "Bring your people, applications and company intelligence into one operating environment." },
  "sign-in": { eyebrow: "ACCOUNT ACCESS", title: "Welcome to Arlovi.", description: "Your work should pick up exactly where you left off." },
  "sign-up": { eyebrow: "CREATE YOUR ACCOUNT", title: "Make room for better work.", description: "Create a home for the organizations and work you manage." },
  recover: { eyebrow: "ACCOUNT RECOVERY", title: "Get back to your work.", description: "Recover your account without losing your place." },
  verify: { eyebrow: "VERIFY YOUR IDENTITY", title: "A secure way back in.", description: "Confirm your identity before opening your organization." },
  security: { eyebrow: "SECURITY CHECK", title: "Protecting your company.", description: "Sensitive business access deserves a verified session." },
  invite: { eyebrow: "WORKSPACE INVITATION", title: "Welcome to your team.", description: "Joining a company should take you directly to the work you've been invited to do." },
};

function LocalCompanies({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const local = ORGS.filter((org) => Boolean(org.ownerName));
  return (
    <section className="entry-local" aria-label="Workspaces saved in this browser">
      <div className="entry-local-heading">
        <strong>Workspaces in this browser</strong>
        <span>{local.length} created</span>
      </div>
      {local.length === 0 ? (
        <p>No local company has been created on this device yet. Start with a new headquarters or explore the sample workspaces.</p>
      ) : local.slice(0, compact ? 2 : undefined).map((org) => (
        <button type="button" className="entry-company" key={org.id} onClick={() => navigate("/o/" + org.slug + "/workspace/home")}>
          <span className="entry-company-mark" style={{ backgroundColor: org.accent }}>{org.shortName.slice(0, 1)}</span>
          <span><strong>{org.name}</strong><small>Local company · {org.currency}</small></span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      ))}
      {compact && local.length > 2 && <Link to="/choose-workspace">See all your local companies</Link>}
    </section>
  );
}

export function WorkspaceChooser() {
  const navigate = useNavigate();
  const local = ORGS.filter((org) => Boolean(org.ownerName));
  const samples = ORGS.filter((org) => !org.ownerName);
  return (
    <main className="entry-screen">
      <header className="entry-top">
        <Link className="entry-wordmark" to="/welcome" aria-label="Arlovi welcome"><ArloviMark size={29} /><strong>arlovi.</strong></Link>
        <Link to="/setup">Create company <ArrowRight size={15}/></Link>
      </header>
      <section className="entry-chooser">
        <span className="entry-eyebrow">YOUR ENVIRONMENTS</span>
        <h1>Choose a workspace.</h1>
        <p>Continue in a company saved to this browser. This list is not a cloud membership directory or an account sign-in.</p>
        <div className="entry-chooser-grid">
          {local.map((org) => (
            <button type="button" key={org.id} className="entry-chooser-card" onClick={() => navigate("/o/" + org.slug + "/workspace/home")}>
              <span className="entry-company-mark" style={{ backgroundColor: org.accent }}>{org.shortName.slice(0, 1)}</span>
              <span><strong>{org.name}</strong><small>{org.currency} · Browser-local company</small></span>
              <ArrowRight size={18} aria-hidden="true"/>
            </button>
          ))}
          <Link to="/setup" className="entry-chooser-card entry-chooser-add"><span className="entry-company-mark"><Building2 size={19}/></span><span><strong>Create a headquarters</strong><small>Start with your company blueprint</small></span><ArrowRight size={18}/></Link>
        </div>
        {samples.length > 0 && <section className="entry-samples"><h2>Sample environments</h2><p>These contain example records for exploring the interface. They are not private accounts.</p><div className="entry-chooser-grid">{samples.map(org => <button type="button" key={org.id} className="entry-chooser-card" onClick={() => navigate("/o/" + org.slug + "/workspace/home")}><span className="entry-company-mark" style={{backgroundColor: org.accent}}>{org.shortName.slice(0,1)}</span><span><strong>{org.name}</strong><small>Sample workspace</small></span><ArrowRight size={18}/></button>)}</div></section>}
        <p className="entry-honesty"><LockKeyhole size={16}/> Access here is local to this browser. Company sign-in, secure multiuser invitations, and cross-device sync require connected identity infrastructure.</p>
      </section>
    </main>
  );
}

export function IdentityEntry({ mode }: { mode: EntryMode }) {
  const copy = COPY[mode];
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const isInvitation = mode === "invite";
  const showEmail = ["sign-in", "sign-up", "recover"].includes(mode);
  const allowLocal = ORGS.some((org) => Boolean(org.ownerName));
  // A URL token is deliberately neither displayed nor accepted without a verified invitation backend.
  const hasInvitation = isInvitation && new URLSearchParams(location.search).has("token");
  const title = isInvitation && hasInvitation ? "Your invitation is waiting." : copy.title;
  function requestCloud() { setRequested(true); }
  return (
    <main className="entry-screen">
      <header className="entry-top">
        <Link className="entry-wordmark" to="/welcome" aria-label="Arlovi welcome"><ArloviMark size={29}/><strong>arlovi.</strong></Link>
        <span className="entry-top-actions"><Link to="/choose-workspace">Local workspaces</Link><Link to="/setup">Create a company <ArrowRight size={15}/></Link></span>
      </header>
      <div className="entry-columns">
        <aside className="entry-story">
          <span className="entry-eyebrow">ONE COMPANY. ONE OPERATING HOME.</span>
          <h2>Your business,<br/>working together.</h2>
          <p>Bring your people, applications, information and intelligence into one thoughtful operating environment.</p>
          <div className="entry-product" aria-label="Illustration of connected business applications">
            <div className="entry-product-top"><span className="entry-dot"/><strong>Executive Home</strong><span>Workspace overview</span></div>
            <div className="entry-product-cards">
              <div><Building2 size={18}/><strong>Company</strong><small>One operating home</small></div>
              <div><Users size={18}/><strong>People</strong><small>Shared responsibilities</small></div>
              <div><CheckCircle2 size={18}/><strong>Work</strong><small>Clear next actions</small></div>
            </div>
            <div className="entry-product-bottom"><span className="entry-product-pulse"/> Your applications, connected by the same company context</div>
          </div>
          <div className="entry-story-foot"><ShieldCheck size={17}/> Designed for clarity, control and confidence.</div>
        </aside>
        <section className="entry-panel" aria-labelledby="entry-title">
          <div className="entry-form">
            <span className="entry-eyebrow">{copy.eyebrow}</span>
            <h1 id="entry-title">{title}</h1>
            <p className="entry-description">{copy.description}</p>
            {mode === "welcome" ? (
              <div className="entry-actions">
                <Link to="/setup" className="entry-primary">Create a company headquarters <ArrowRight size={17}/></Link>
                <Link to="/choose-workspace" className="entry-secondary">Open a local workspace <ArrowRight size={17}/></Link>
                <p className="entry-helper">Creating a company saves its initial records in this browser. Cloud accounts and shared collaboration are not yet connected.</p>
              </div>
            ) : (
              <>
                {showEmail && <form className="entry-email" onSubmit={(e) => { e.preventDefault(); requestCloud(); }}>
                  <label htmlFor="entry-email">Work email</label>
                  <div className="entry-input-wrap"><Mail size={17} aria-hidden="true"/><input id="entry-email" type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value);setRequested(false); }} placeholder="you@company.com" required /></div>
                  <button className="entry-primary" type="submit">{mode === "recover" ? "Check account recovery" : "Continue with email"} <ArrowRight size={17}/></button>
                </form>}
                {["verify", "security"].includes(mode) && <div className="entry-security-icon"><KeyRound size={25}/><p>A verified authentication service must issue and validate security challenges. No verification code is requested in local mode.</p></div>}
                {isInvitation && <div className="entry-security-icon"><Mail size={25}/><p>Invitations can only be accepted after verifying the invitation and the user's identity. This browser does not grant membership from a link alone.</p></div>}
                <div className="entry-boundary" role={requested ? "status" : "note"}>
                  <LockKeyhole size={19} aria-hidden="true"/>
                  <div><strong>{requested ? "Cloud identity is not connected" : "Account services are not connected"}</strong><p>{requested ? "No account request was sent and no password was collected. Your email was not stored." : "This frontend is currently a browser-local workspace. Email sign-in, Google, Microsoft, passkeys, MFA and secure invitations require a trusted identity provider."}</p></div>
                </div>
                <Link className="entry-secondary" to="/choose-workspace">Continue in a local workspace <ArrowRight size={16}/></Link>
                {mode === "sign-in" && <div className="entry-switch">New to Arlovi? <Link to="/auth/sign-up">Create an account</Link> · <Link to="/auth/recover">Account recovery</Link></div>}
                {mode === "sign-up" && <div className="entry-switch">Already have an account? <Link to="/auth/sign-in">Sign in</Link></div>}
                {mode !== "sign-in" && mode !== "sign-up" && <div className="entry-switch"><Link to="/auth/sign-in">Back to sign in</Link></div>}
              </>
            )}
            {allowLocal && mode === "welcome" && <LocalCompanies compact />}
            <footer className="entry-footer">Arlovi · Business operating environment · <Link to="/choose-workspace">Browse workspaces</Link></footer>
          </div>
        </section>
      </div>
    </main>
  );
}
