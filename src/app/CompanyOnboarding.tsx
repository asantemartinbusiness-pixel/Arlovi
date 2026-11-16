import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArloviMark } from "@/app/brand";
import { db } from "@/runtime/db";
import { clockIso } from "@/platform/clock";
import type { Audit, Rec } from "@/domain/types";
import { isOrganizationSlugAvailable, registerLocalOrganization, type OrgProfile } from "@/platform/org";
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
  goal: string;
}
const KEY = "arlovi-company-setup-draft-v1";
const STEPS = ["Company", "Identity", "Departments", "Intelligence", "Launch"];
const DEFAULT: Setup = {
  company: "", slug: "", owner: "", territory: "GB", currency: "GBP",
  timezone: "Europe/London", accent: "#234FE8", description: "",
  departments: ["Operations", "Finance", "Sales", "Marketing", "People", "Creative", "Customer Care", "Engineering"],
  agents: ["Chief of Staff", "Finance Analyst", "Creative Director"], goal: "",
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

function restored(): Setup {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULT;
    const parsed = JSON.parse(stored) as Partial<Setup>;
    return { ...DEFAULT, ...parsed, departments: Array.isArray(parsed.departments) ? parsed.departments : DEFAULT.departments, agents: Array.isArray(parsed.agents) ? parsed.agents : DEFAULT.agents };
  } catch { return DEFAULT; }
}
function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

export function CompanyOnboarding() {
  const navigate = useNavigate();
  const [setup, setSetup] = useState<Setup>(restored);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(setup)); } catch { /* browser restrictions will be checked at finish */ }
  }, [setup]);

  function change<K extends keyof Setup>(key: K, value: Setup[K]) {
    setSetup((current) => ({ ...current, [key]: value }));
    setError("");
  }
  function toggle(key: "departments" | "agents", value: string) {
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
    if (at === 2 && setup.departments.length === 0) return "Select at least one department.";
    return "";
  }
  function next() {
    const issue = validate(step);
    if (issue) { setError(issue); return; }
    setStep((value) => Math.min(value + 1, STEPS.length - 1));
    setError("");
  }
  async function finish() {
    const issue = validate(0) || validate(2);
    if (issue) { setError(issue); setStep(issue.includes("department") ? 2 : 0); return; }
    setBusy(true); setError("");
    const now = clockIso();
    const orgId = "org-" + crypto.randomUUID();
    const profile: OrgProfile = {
      id: orgId, slug: setup.slug, name: setup.company.trim(), shortName: setup.company.trim().split(" ")[0],
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
      slug: profile.slug, locale: profile.locale, legalName: profile.name, executionPaused: false,
      jurisdiction: profile.jurisdiction, timezone: profile.timezone, brandAccent: profile.accent,
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
      try { localStorage.removeItem(KEY); } catch { /* no sensitive data should be kept in this draft */ }
      navigate("/o/" + profile.slug + "/hq/home", { replace: true });
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

  return (
    <main className="onb" id="main">
      <header className="onb-top">
        <Link className="onb-logo" to="/o/northline/hq/home" aria-label="Arlovi home"><ArloviMark size={34}/><strong>arlovi.</strong></Link>
        <span className="onb-topnote">Company headquarters setup</span>
        <Link to="/o/northline/hq/home">Return to workspace</Link>
      </header>
      <div className="onb-layout">
        <aside className="onb-intro">
          <div className="onb-eyebrow">ONE COMPANY. ONE OPERATING HOME.</div>
          <h1>Bring your organization together.</h1>
          <p>Design your company's headquarters: people, AI specialists, departments and a shared starting point for all 35 native applications.</p>
          <div className="onb-art" aria-hidden="true">
            <div className="onb-orbit onb-orbit-one"/><div className="onb-orbit onb-orbit-two"/>
            <div className="onb-node onb-node-one"/><div className="onb-node onb-node-two"/><div className="onb-node onb-node-three"/>
          </div>
          <p className="onb-scope">This setup creates a working browser-local company. Team invitations, cloud sync, live AI models and external services require future connections.</p>
        </aside>
        <section className="onb-form" aria-label="Company setup">
          <nav className="onb-progress" aria-label="Company setup steps">
            {STEPS.map((label, index) => (
              <button type="button" key={label} disabled={index > step}
                className={index === step ? "onb-step current" : "onb-step"} aria-current={index === step ? "step" : undefined}
                onClick={() => { setStep(index); setError(""); }}>
                <span>{String(index + 1).padStart(2,"0")}</span>{label}
              </button>
            ))}
          </nav>
          <div className="onb-stepbody">
            {step === 0 && <>
              <div className="onb-caption">01 / COMPANY</div><h2>Start with your business.</h2>
              <p>The same company identity will be available to Finance, CRM, People, Studio and the AI workforce.</p>
              <label className="onb-field">Company name
                <input required aria-label="Company name" value={setup.company} onChange={(e) => {
                  const name=e.target.value;setSetup(v=>({...v, company:name, slug:slugify(name)}));setError("");
                }} placeholder="Your company name"/>
              </label>
              <label className="onb-field">Company address
                <span className="onb-hint">arlovi / o / {setup.slug || "your-company"}</span>
                <input required aria-label="Company address" value={setup.slug} onChange={(e)=>change("slug",slugify(e.target.value))} placeholder="your-company"/>
              </label>
              <label className="onb-field">Your name
                <input required aria-label="Your name" value={setup.owner} onChange={(e)=>change("owner",e.target.value)} placeholder="Workspace owner"/>
              </label>
              <label className="onb-field">Country or region
                <select aria-label="Country or region" value={setup.territory} onChange={(e)=>{
                  const territory=e.target.value as Territory; const regional=TERRITORIES[territory];
                  setSetup(v=>({...v,territory,currency:regional.currency,timezone:regional.timezone}));
                }}>
                  {Object.entries(TERRITORIES).map(([code,value])=><option key={code} value={code}>{value.label}</option>)}
                </select>
              </label>
              <label className="onb-field">Operating currency
                <select aria-label="Operating currency" value={setup.currency} onChange={(e)=>change("currency",e.target.value)}>
                  {["GBP","USD","EUR","CAD","AUD","XCD"].map(code=><option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label className="onb-field">Company timezone
                <select aria-label="Company timezone" value={setup.timezone} onChange={(e)=>change("timezone",e.target.value)}>
                  {[setup.timezone,"UTC","Europe/London","Europe/Paris","America/Tortola","America/New_York","America/Los_Angeles","Asia/Singapore"].filter((entry,index,all)=>all.indexOf(entry)===index).map(zone=><option key={zone} value={zone}>{zone}</option>)}
                </select>
              </label>
            </>}
            {step === 1 && <>
              <div className="onb-caption">02 / IDENTITY</div><h2>Make it yours.</h2>
              <p>Your palette and company story are shared across your native workspaces and creative tools.</p>
              <label className="onb-field">What does your company do?
                <textarea value={setup.description} aria-label="Company overview" onChange={(e)=>change("description",e.target.value)} rows={5} placeholder="Describe your services, clients and goals. This stays a draft knowledge source until you review it."/>
              </label>
              <fieldset className="onb-colors"><legend>Company accent</legend><div>
                {COLORS.map(color=><button key={color} type="button" aria-label={"Select accent "+color} aria-pressed={setup.accent===color}
                  className={setup.accent===color?"onb-color onb-color-selected":"onb-color"} style={{background:color}} onClick={()=>change("accent",color)}/>)}
              </div></fieldset>
              <div className="onb-note">Brand rules, typography, logos, assets and advanced customization remain editable inside Arlovi.</div>
            </>}
            {step === 2 && <>
              <div className="onb-caption">03 / DEPARTMENTS</div><h2>Organize your headquarters.</h2>
              <p>Choose the teams you want shown in your company structure. All 35 native applications remain available.</p>
              <div className="onb-options">
                {DEPARTMENTS.map(name=><label key={name} className="onb-option">
                  <input type="checkbox" checked={setup.departments.includes(name)} onChange={()=>toggle("departments",name)}/>
                  <span>{name}</span>
                </label>)}
              </div>
            </>}
            {step === 3 && <>
              <div className="onb-caption">04 / INTELLIGENCE</div><h2>Plan your AI workforce.</h2>
              <p>Create initial specialist employee profiles. They remain drafts with no execution authority until configured and approved.</p>
              <div className="onb-options">
                {AGENTS.map(name=><label key={name} className="onb-option">
                  <input type="checkbox" checked={setup.agents.includes(name)} onChange={()=>toggle("agents",name)}/>
                  <span>{name}</span>
                </label>)}
              </div>
              <div className="onb-note">AI employees are clearly differentiated from human staff. No real model execution or automated outreach is claimed.</div>
            </>}
            {step === 4 && <>
              <div className="onb-caption">05 / LAUNCH</div><h2>Your headquarters is ready to create.</h2>
              <p>Review the foundations. Your work remains editable throughout Arlovi.</p>
              <dl className="onb-review">
                <div><dt>Company</dt><dd>{setup.company}</dd></div>
                <div><dt>Region</dt><dd>{TERRITORIES[setup.territory].label} · {setup.currency}</dd></div>
                <div><dt>Departments</dt><dd>{setup.departments.join(", ")}</dd></div>
                <div><dt>AI employee drafts</dt><dd>{setup.agents.join(", ") || "None"}</dd></div>
              </dl>
              <label className="onb-field">Your first mission
                <textarea aria-label="First mission" value={setup.goal} rows={3} onChange={(e)=>change("goal",e.target.value)}
                  placeholder="What would you like your team to accomplish?"/>
              </label>
              <div className="onb-note">This mission is saved as a draft awaiting review; nothing runs or leaves the browser.</div>
            </>}
          </div>
          {error && <p className="onb-error" role="alert">{error}</p>}
          <div className="onb-actions">
            <button type="button" className="onb-secondary" disabled={step===0 || busy} onClick={()=>{setStep(s=>s-1);setError("");}}>Back</button>
            <span className="onb-counter">{step+1} of {STEPS.length}</span>
            {step<STEPS.length-1
              ? <button type="button" className="onb-primary" onClick={next}>Continue</button>
              : <button type="button" className="onb-primary" disabled={busy} onClick={()=>{void finish();}}>{busy?"Creating company…":"Enter headquarters"}</button>}
          </div>
        </section>
      </div>
    </main>
  );
}
