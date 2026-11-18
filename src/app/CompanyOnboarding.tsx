import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArloviMark } from "@/app/brand";
import { db } from "@/runtime/db";
import { clockIso } from "@/platform/clock";
import type { Audit, Rec } from "@/domain/types";
import { isOrganizationSlugAvailable, orgBySlug, registerLocalOrganization, type OrgProfile } from "@/platform/org";
import "./onboarding.css";

type Territory = "GB" | "US" | "VG" | "OTHER";
interface Setup {
  company: string;
  slug: string;
  owner: string;
  territory: Territory;
  currency: string;
  timezone: string;
  accent: string;
  description: string;
  departments: string[];
  agents: string[];
  knowledgeNotes: string;
  colleagues: string;
  preferredApps: string[];
  teamChannels: string[];
  dailyBriefing: boolean;
  approvalMode: "review_all" | "supervised_drafts";
  goal: string;
  businessType: "services" | "retail" | "creative" | "technology" | "nonprofit" | "other";
  teamSize: "solo" | "small" | "growing" | "established";
}
const KEY = "arlovi-company-setup-draft-v1";
const STEP_KEY = "arlovi-company-setup-step-v2";
const STEPS = ["Company identity", "Operating model", "People & intelligence", "Review & create"];
const DEFAULT: Setup = {
  company: "", slug: "", owner: "", territory: "GB", currency: "GBP",
  timezone: "Europe/London", accent: "#234FE8", description: "",
  departments: ["Operations", "Finance", "Sales", "Marketing", "People", "Creative", "Customer Care", "Engineering"],
  agents: ["Chief of Staff", "Finance Analyst", "Creative Director"],
  knowledgeNotes: "", colleagues: "",
  preferredApps: ["Headquarters", "AI Workforce", "Missions", "Finance", "CRM", "Projects", "Communications", "Docs", "Sheets", "Design"],
  teamChannels: ["Company Updates", "Leadership", "Operations"],
  dailyBriefing: true, approvalMode: "review_all", goal: "", businessType: "services", teamSize: "growing",
};
const TERRITORIES: Record<Territory, { currency: string; timezone: string; locale: string; label: string }> = {
  GB: { currency: "GBP", timezone: "Europe/London", locale: "en-GB", label: "United Kingdom" },
  US: { currency: "USD", timezone: "America/New_York", locale: "en-US", label: "United States" },
  VG: { currency: "USD", timezone: "America/Tortola", locale: "en-VG", label: "British Virgin Islands" },
  OTHER: { currency: "USD", timezone: "UTC", locale: "en", label: "Other / configure later" },
};
const DEPARTMENTS = ["Operations", "Finance", "Sales", "Marketing", "People", "Creative", "Customer Care", "Engineering", "Legal", "Procurement", "IT", "Research"];
const AGENTS = ["Chief of Staff", "Finance Analyst", "Creative Director", "Sales Researcher", "Operations Coordinator", "Customer Care Specialist"];
const COLORS = ["#234FE8", "#006E70", "#6236D1", "#C24B24", "#A51F63", "#20242B"];
const APPS = ["Headquarters", "Inbox", "Assets", "Administration", "Ask Arlovi", "Company Brain", "AI Workforce", "Missions", "Automation", "Analytics", "Finance", "CRM", "People", "Projects", "Communications", "Customer Care", "Legal", "Marketing", "Commerce", "Bookings", "Procurement", "Portals", "Docs", "Sheets", "Present", "Design", "Photo", "Layout", "Video", "Motion", "Websites", "App Builder", "Forms", "Integrations", "IT Operations"];
const CHANNELS = ["Company Updates", "Leadership", "Operations", "Announcements", "Creative", "Sales", "Support", "Engineering"];

function restored(): Setup {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULT;
    const parsed = JSON.parse(stored) as Partial<Setup>;
    return { ...DEFAULT, ...parsed,
      departments: Array.isArray(parsed.departments) ? parsed.departments : DEFAULT.departments,
      agents: Array.isArray(parsed.agents) ? parsed.agents : DEFAULT.agents,
      preferredApps: Array.isArray(parsed.preferredApps) ? parsed.preferredApps : DEFAULT.preferredApps,
      teamChannels: Array.isArray(parsed.teamChannels) ? parsed.teamChannels : DEFAULT.teamChannels,
    };
  } catch { return DEFAULT; }
}
function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function CompanyOnboarding() {
  const navigate = useNavigate();
  const previousSlug = (() => {
    try { return localStorage.getItem("arlovi-last-workspace"); } catch { return null; }
  })();
  const previous = previousSlug ? orgBySlug(previousSlug) : undefined;
  const [setup, setSetup] = useState<Setup>(restored);
  const [step, setStep] = useState(() => {
    try { return Math.min(3, Math.max(0, Number(localStorage.getItem(STEP_KEY)) || 0)); } catch { return 0; }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(setup)); } catch { /* browser restrictions will be checked at finish */ }
  }, [setup]);
  useEffect(() => {
    try { localStorage.setItem(STEP_KEY, String(step)); } catch { /* resumable when storage is available */ }
  }, [step]);

  function change<K extends keyof Setup>(key: K, value: Setup[K]) {
    setSetup((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function toggle(key: "departments" | "agents" | "preferredApps" | "teamChannels", value: string) {
    setSetup((current) => ({
      ...current,
      [key]: current[key].includes(value) ? current[key].filter((entry) => entry !== value) : [...current[key], value],
    }));
  }
  function validate(at: number): string {
    if (at === 0) {
      if (setup.company.trim().length < 2) return "Enter a company name of at least two characters.";
      if (!isOrganizationSlugAvailable(setup.slug)) return "Choose an available company address using letters, numbers and hyphens.";
      if (!setup.owner.trim()) return "Enter the name of the person managing this workspace.";
    }
    if (at === 1 && setup.departments.length === 0) return "Select at least one department.";
    return "";
  }
  function next() {
    const issue = validate(step);
    if (issue) { setError(issue); return; }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
    setError("");
  }
  async function finish() {
    const issue = validate(0) || validate(1);
    if (issue) { setError(issue); setStep(issue.includes("department") ? 1 : 0); return; }
    setBusy(true); setError("");
    const now = clockIso();
    const orgId = "org-" + crypto.randomUUID();
    const profile: OrgProfile = {
      id: orgId, slug: setup.slug, name: setup.company.trim(), shortName: setup.company.trim().split(" ")[0],
      ownerName: setup.owner.trim(),
      currency: setup.currency, locale: TERRITORIES[setup.territory].locale,
      timezone: setup.timezone, jurisdiction: setup.territory,
      accent: setup.accent,
    };
    const build = (collection: string, title: string, status: string, fields: Record<string, string | number | boolean> = {}, summary = "", body?: unknown): Rec => ({
      id: crypto.randomUUID(), organizationId: orgId, collection, title, status,
      ownerName: setup.owner.trim(), summary, currency: setup.currency,
      tags: ["created-in-setup"], fields, body, createdAt: now, updatedAt: now, revision: 1,
      createdBy: setup.owner.trim(), updatedBy: setup.owner.trim(), history: [],
    });
    const organization = { ...build("organizations", profile.name, "active", {
      slug: profile.slug, locale: profile.locale, legalName: profile.name, executionPaused: true,
      jurisdiction: profile.jurisdiction, timezone: profile.timezone, brandAccent: profile.accent, businessType: setup.businessType, teamSize: setup.teamSize,
    }, setup.description.trim()), id: orgId };
    const records: Rec[] = [organization];
    records.push(build("members", setup.owner.trim(), "active", { kind: "human", role: "owner", workspaceOnly: true }, "Owner view for the local workplace."));
    records.push(build("brands", profile.name + " identity", "draft", { accent: profile.accent, companyId: orgId }, "Company identity, ready for refinement in the native Brand workspace."));
    for (const name of setup.departments) {
      records.push(build("departments", name, "active", { lead: setup.owner.trim(), members: 1 }, "Department established during company setup."));
    }
    for (const name of setup.agents) {
      const matching = records.find((row) => row.collection === "departments" && (name.includes("Finance") && row.title === "Finance" || name.includes("Creative") && row.title === "Creative"));
      records.push(build("agents", name, "draft", {
        kind: "ai", role: name, model: "not_connected", autonomy: "suggest",
        departmentId: matching?.id ?? "", recordedCostMinor: 0, spendCapMinor: 0,
      }, "AI employee contract drafted. No model is connected and no work has been executed.", {
        skills: [], tools: [], authority: ["Read explicitly approved local records"], sources: [],
      }));
    }
    if (setup.description.trim()) records.push(build("sources", "Company overview", "awaiting_review", { source: "owner-setup", trusted: false }, setup.description.trim(), { text: setup.description.trim() }));
    if (setup.knowledgeNotes.trim()) records.push(build("sources", "Initial company knowledge", "awaiting_review", { source: "owner-setup", trusted: false }, setup.knowledgeNotes.trim(), { text: setup.knowledgeNotes.trim() }));
    for (const colleague of setup.colleagues.split("\n").map((person) => person.trim()).filter(Boolean)) {
      records.push(build("members", colleague, "invitation_draft", { kind: "human", role: "member", invitationSent: false }, "Invitation not sent. Confirm access and contact details in Administration."));
    }
    for (const app of APPS) {
      records.push(build("preferences", `App preference: ${app}`, "active", { app, pinned: setup.preferredApps.includes(app), mode: "native_local" }, "App remains available. Preference controls starting workspace navigation only."));
    }
    for (const channel of setup.teamChannels) {
      records.push(build("channels", channel, "active", { visibility: "internal", createdFromSetup: true }, "Local team space, with no externally delivered invitations."));
    }
    records.push(build("policies", "Company autonomy policy", "draft", {
      mode: setup.approvalMode, approvalRequired: true, externalActionsAllowed: false, spendCapMinor: 0,
    }, "Agents remain drafts, company execution starts paused, and external actions require verified connections."));
    records.push(build("preferences", "Executive briefing", "active", { dailyBriefing: setup.dailyBriefing, externalDelivery: false }, "Local notification preference only."));
    records.push(build("missions", setup.goal.trim() || "Establish our company workspace", "draft",
      { stage: "planning", requiresApproval: true, execution: "not_connected" },
      "First mission brief awaiting human review. No AI task or external action has executed."));
    records.push(build("conversations", "Getting started with " + profile.shortName, "active",
      { shared: false, source: "setup" }, "A place to ask about this company. Model inference is not connected.", { turns: [] }));
    const audit: Audit = {
      id: crypto.randomUUID(), organizationId: orgId, at: now, actor: setup.owner.trim(),
      type: "organization.created_local", message: "Company workspace created locally with explicit company identity and selected departments.",
    };
    let persisted = false;
    try {
      await db.transaction("rw", [db.records, db.events], async () => {
        await db.records.bulkAdd(records);
        await db.events.add(audit);
      });
      persisted = true;
      registerLocalOrganization(profile);
      try { localStorage.setItem("arlovi-last-workspace", profile.slug); } catch { /* optional browser navigation preference */ }
      try { localStorage.removeItem(KEY); localStorage.removeItem(STEP_KEY); } catch { /* storage may be disabled */ }
      navigate("/o/" + profile.slug + "/workspace/home", { replace: true });
    } catch (cause) {
      if (persisted) {
        await db.transaction("rw", [db.records, db.events], async () => {
          await db.records.bulkDelete(records.map((record) => record.id));
          await db.events.delete(audit.id);
        }).catch(() => undefined);
      }
      setError(cause instanceof Error ? cause.message : "The company could not be saved. Your setup has been kept.");
    } finally { setBusy(false); }
  }


  const presets: Record<Setup["businessType"], string[]> = {
    services: ["Headquarters", "CRM", "Projects", "Customer Care", "Finance", "People", "Docs"],
    retail: ["Headquarters", "Commerce", "Procurement", "Finance", "Customer Care", "Marketing", "People"],
    creative: ["Headquarters", "Projects", "Design", "Docs", "Marketing", "Present", "Finance"],
    technology: ["Headquarters", "Projects", "App Builder", "Automation", "Analytics", "IT Operations", "CRM"],
    nonprofit: ["Headquarters", "Projects", "People", "Finance", "Communications", "Forms", "Docs"],
    other: ["Headquarters", "Projects", "Finance", "CRM", "People", "Docs"],
  };
  function selectIndustry(value: Setup["businessType"]) {
    setSetup(current => ({ ...current, businessType: value, preferredApps: [...new Set([...current.preferredApps, ...presets[value]])] }));
    setError("");
  }

  return (
    <main className="onb onb-reimagined" id="main">
      <header className="onb-top">
        <Link className="onb-logo" to="/welcome" aria-label="Arlovi home"><ArloviMark size={34}/><strong>arlovi.</strong></Link>
        <span className="onb-topnote">Build your company's headquarters</span>
        {previous && <Link to={"/o/" + previous.slug + "/workspace/home"}>Return to {previous.shortName}</Link>}
        {!previous && <Link to="/choose-workspace">Workspaces</Link>}
      </header>
      <div className="onb-layout">
        <aside className="onb-intro" aria-label="Company blueprint preview">
          <div className="onb-eyebrow">YOUR COMPANY BLUEPRINT</div>
          <h1>One operating home, built around your business.</h1>
          <p>Establish the essentials first. We'll prepare your operating structure, applications, team and AI specialist drafts, all ready for your review.</p>
          <div className="onb-blueprint">
            <div className="onb-blueprint-head"><strong>{setup.company.trim() || "Your future headquarters"}</strong><span>Live preview</span></div>
            <div className="onb-blueprint-stat"><span>Business</span><strong>{setup.businessType.charAt(0).toUpperCase() + setup.businessType.slice(1)}</strong></div>
            <div className="onb-blueprint-stat"><span>Organization</span><strong>{setup.teamSize === "solo" ? "Independent" : setup.teamSize === "small" ? "Small team" : setup.teamSize === "growing" ? "Growing team" : "Established"}</strong></div>
            <div className="onb-blueprint-counters">
              <div><strong>{setup.departments.length}</strong><span>Departments</span></div>
              <div><strong>{setup.preferredApps.length}</strong><span>Pinned apps</span></div>
              <div><strong>{setup.agents.length}</strong><span>AI drafts</span></div>
            </div>
            <div className="onb-blueprint-foot">All native applications stay available. AI execution, cloud accounts and external invitations are not activated by setup.</div>
          </div>
          <p className="onb-scope">Your answers are saved in this browser as you go. This version creates a browser-local company, not a verified cloud account. You can return to Company Setup after entering the workspace.</p>
        </aside>
        <section className="onb-form" aria-label="Company setup">
          <nav className="onb-progress" aria-label="Company setup stages">
            {STEPS.map((label,index) => (
              <button type="button" key={label} disabled={index>step || busy} className={index===step ? "onb-step current" : "onb-step"}
                aria-current={index===step ? "step" : undefined} onClick={() => {setStep(index);setError("");}}>
                <span>{String(index+1).padStart(2,"0")}</span>{label}
              </button>
            ))}
          </nav>
          <div className="onb-stepbody">
            {step===0 && <>
              <div className="onb-caption">01 / COMPANY IDENTITY</div>
              <h2>Tell us about your company.</h2>
              <p>Start with the essentials. You can refine your identity, brand and operating details at any time.</p>
              <label className="onb-field">Company name
                <input required autoComplete="organization" value={setup.company} onChange={e => {
                  const name=e.target.value;setSetup(v=>({...v,company:name,slug:slugify(name)}));setError("");
                }} placeholder="Your company name"/>
              </label>
              <label className="onb-field">Your name
                <input required autoComplete="name" value={setup.owner} onChange={e=>change("owner",e.target.value)} placeholder="Workspace creator"/>
              </label>
              <label className="onb-field">What does your company do?
                <textarea value={setup.description} onChange={e=>change("description",e.target.value)} rows={3} placeholder="A short description of your services, products or work"/>
              </label>
              <label className="onb-field">Country or region
                <select value={setup.territory} onChange={e=>{
                  const territory=e.target.value as Territory;const regional=TERRITORIES[territory];
                  setSetup(v=>({...v,territory,currency:regional.currency,timezone:regional.timezone}));
                }}>
                  {Object.entries(TERRITORIES).map(([code,value])=><option value={code} key={code}>{value.label}</option>)}
                </select>
              </label>
              <details className="onb-detail"><summary>Company address, region and branding preferences</summary>
                <label className="onb-field">Company workspace address
                  <span className="onb-hint">/o/{setup.slug || "your-company"}</span>
                  <input required aria-label="Workspace address" value={setup.slug} onChange={e=>change("slug",slugify(e.target.value))}/>
                </label>
                <div className="onb-inline-fields">
                  <label className="onb-field">Operating currency
                    <select value={setup.currency} onChange={e=>change("currency",e.target.value)}>{["GBP","USD","EUR","CAD","AUD","XCD"].map(code=><option key={code}>{code}</option>)}</select>
                  </label>
                  <label className="onb-field">Timezone
                    <select value={setup.timezone} onChange={e=>change("timezone",e.target.value)}>
                      {[setup.timezone,"UTC","Europe/London","America/Tortola","America/New_York","America/Los_Angeles","Europe/Paris","Asia/Singapore"].filter((v,i,a)=>a.indexOf(v)===i).map(zone=><option value={zone} key={zone}>{zone}</option>)}
                    </select>
                  </label>
                </div>
                <fieldset className="onb-colors"><legend>Company accent</legend><div>{COLORS.map(color=><button key={color} type="button" aria-label={"Choose accent "+color} aria-pressed={setup.accent===color} className={setup.accent===color?"onb-color onb-color-selected":"onb-color"} style={{background:color}} onClick={()=>change("accent",color)}/>)}</div></fieldset>
              </details>
            </>}
            {step===1 && <>
              <div className="onb-caption">02 / OPERATING MODEL</div>
              <h2>How does your company work?</h2>
              <p>Choose a starting model. Arlovi will suggest relevant applications while keeping the complete suite available.</p>
              <label className="onb-field">Main type of business
                <select value={setup.businessType} onChange={e=>selectIndustry(e.target.value as Setup["businessType"])}>
                  <option value="services">Professional or service business</option>
                  <option value="retail">Retail or commerce</option>
                  <option value="creative">Creative studio or agency</option>
                  <option value="technology">Technology or software</option>
                  <option value="nonprofit">Nonprofit or community organization</option>
                  <option value="other">Other or mixed activity</option>
                </select>
              </label>
              <fieldset className="onb-choices"><legend>How is your team organized?</legend>
                <div className="onb-team-choices">
                  {([
                    ["solo","Independent","Just me, or a small independent practice"],
                    ["small","Small team","A handful of people sharing responsibilities"],
                    ["growing","Growing organization","Several teams or expanding responsibilities"],
                    ["established","Established company","Defined departments and reporting structures"]
                  ] as const).map(([value,label,description])=>(
                    <label className="onb-team-choice" key={value} data-checked={setup.teamSize===value}>
                      <input type="radio" name="teamSize" checked={setup.teamSize===value} onChange={()=>change("teamSize",value)} />
                      <span><strong>{label}</strong><small>{description}</small></span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <details className="onb-detail" open><summary>Departments ({setup.departments.length} selected)</summary>
                <p className="onb-detail-description">These become local company departments. You can edit their responsibilities later.</p>
                <div className="onb-options">{DEPARTMENTS.map(name=><label key={name} className="onb-option"><input type="checkbox" checked={setup.departments.includes(name)} onChange={()=>toggle("departments",name)}/><span>{name}</span></label>)}</div>
              </details>
              <details className="onb-detail"><summary>Favorite applications ({setup.preferredApps.length} selected)</summary>
                <p className="onb-detail-description">Pin the applications you expect to use first. No native application is removed.</p>
                <div className="onb-options">{APPS.map(name=><label key={name} className="onb-option"><input type="checkbox" checked={setup.preferredApps.includes(name)} onChange={()=>toggle("preferredApps",name)}/><span>{name}</span></label>)}</div>
              </details>
            </>}
            {step===2 && <>
              <div className="onb-caption">03 / PEOPLE & INTELLIGENCE</div>
              <h2>Prepare your people and tools.</h2>
              <p>Your team, company knowledge, collaboration and AI specialists should work from the same business context. You control what becomes active.</p>
              <details className="onb-detail" open><summary>Team invitations</summary>
                <label className="onb-field">Colleagues (one name or email address per line)
                  <textarea rows={3} value={setup.colleagues} onChange={e=>change("colleagues",e.target.value)} placeholder={"Jordan Smith\nteam@example.com"}/>
                </label>
                <div className="onb-note">These are invitation drafts only. No email is sent and no access is granted.</div>
              </details>
              <details className="onb-detail"><summary>Company Brain knowledge</summary>
                <label className="onb-field">Key company knowledge or operating instructions
                  <textarea rows={4} value={setup.knowledgeNotes} onChange={e=>change("knowledgeNotes",e.target.value)} placeholder="Business priorities, products, policies or information the team should understand"/>
                </label>
                <div className="onb-note">Knowledge is stored as unverified source material awaiting human review.</div>
              </details>
              <details className="onb-detail"><summary>AI employee drafts ({setup.agents.length})</summary>
                <div className="onb-options">{AGENTS.map(name=><label key={name} className="onb-option"><input type="checkbox" checked={setup.agents.includes(name)} onChange={()=>toggle("agents",name)}/><span>{name}</span></label>)}</div>
                <div className="onb-note">No model is connected, and no AI specialist receives autonomous authority at creation.</div>
              </details>
              <details className="onb-detail"><summary>Collaboration and daily briefings</summary>
                <div className="onb-options">{CHANNELS.map(name=><label key={name} className="onb-option"><input type="checkbox" checked={setup.teamChannels.includes(name)} onChange={()=>toggle("teamChannels",name)}/><span>{name}</span></label>)}</div>
                <label className="onb-option onb-briefing"><input type="checkbox" checked={setup.dailyBriefing} onChange={e=>change("dailyBriefing",e.target.checked)}/><span>Prepare a local executive briefing</span></label>
              </details>
              <details className="onb-detail" open><summary>AI supervision and authority</summary>
                <div className="onb-options">
                  <label className="onb-option"><input type="radio" name="approval-mode" checked={setup.approvalMode==="review_all"} onChange={()=>change("approvalMode","review_all")}/><span>Review every AI action</span></label>
                  <label className="onb-option"><input type="radio" name="approval-mode" checked={setup.approvalMode==="supervised_drafts"} onChange={()=>change("approvalMode","supervised_drafts")}/><span>Allow local drafts with human review</span></label>
                </div>
                <div className="onb-note">External actions, payments and publishing remain blocked until independently authorized and connected.</div>
              </details>
            </>}
            {step===3 && <>
              <div className="onb-caption">04 / REVIEW & CREATE</div>
              <h2>Your headquarters is taking shape.</h2>
              <p>Review the foundations of your operating environment. Nothing here sends invitations, activates AI or connects outside providers.</p>
              <div className="onb-review-cards">
                <div><strong>Company identity</strong><p>{setup.company} · {TERRITORIES[setup.territory].label} · {setup.currency}</p><button type="button" onClick={()=>setStep(0)}>Edit identity</button></div>
                <div><strong>Organization</strong><p>{setup.departments.length} departments · {setup.teamSize} company</p><button type="button" onClick={()=>setStep(1)}>Edit structure</button></div>
                <div><strong>People and collaboration</strong><p>{setup.colleagues.split("\n").filter(Boolean).length} invitation drafts · {setup.teamChannels.length} channels</p><button type="button" onClick={()=>setStep(2)}>Edit people</button></div>
                <div><strong>Apps and AI workforce</strong><p>{setup.preferredApps.length} pinned apps · {setup.agents.length} AI drafts</p><button type="button" onClick={()=>setStep(2)}>Review intelligence</button></div>
              </div>
              <label className="onb-field">Your first business objective (optional)
                <textarea rows={3} value={setup.goal} onChange={e=>change("goal",e.target.value)} placeholder="What should your company focus on first?"/>
              </label>
              <div className="onb-note">Your first objective is saved as a draft. There is no automatic execution. The permanent Company Setup Centre will remain available once you enter your headquarters.</div>
            </>}
          </div>
          {error && <p className="onb-error" role="alert">{error}</p>}
          <div className="onb-actions">
            <button type="button" className="onb-secondary" disabled={step===0 || busy} onClick={()=>{setStep(v=>v-1);setError("");}}>Back</button>
            <span className="onb-counter">Stage {step+1} of {STEPS.length} · Saved locally</span>
            {step<STEPS.length-1
              ? <button type="button" className="onb-primary" disabled={busy} onClick={next}>Continue</button>
              : <button type="button" className="onb-primary" disabled={busy} onClick={()=>{void finish();}}>{busy?"Creating headquarters…":"Create my headquarters"}</button>}
          </div>
        </section>
      </div>
    </main>
  );
}
