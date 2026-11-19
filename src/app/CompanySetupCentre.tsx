import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Bot, Building2, CheckCircle2, CircleDot, Compass, Grid2X2, LockKeyhole, Network, PlugZap, ShieldCheck, Users } from "lucide-react";
import { appEntry } from "@/app/catalog";
import { useCollections, useWorkspace } from "@/platform/workspace";
import "./company-setup-centre.css";

type Section = {
  title: string;
  description: string;
  href: string;
  detail: string;
  state: "review" | "ready" | "draft" | "connection";
  Icon: typeof Building2;
};

export function CompanySetupCentre() {
  const { org, role } = useWorkspace();
  const data = useCollections(["organizations","departments","members","agents","sources","preferences","channels","policies"]);
  const company = data.organizations.find(record => record.id === org.id);
  const human = data.members.filter(record => record.fields.kind === "human");
  const invitationDrafts = human.filter(record => record.status === "invitation_draft");
  const reviewedSources = data.sources.filter(record => record.status === "verified" || record.status === "indexed");
  const draftedAgents = data.agents.filter(record => record.status === "draft");
  const pinnedApps = data.preferences.filter(record => record.fields.pinned === true);
  const sections: Section[] = [
    {
      title: "Company & identity", description: "Company details, region, brands and the legal operating profile.",
      href: appEntry("ADMIN",org.slug), detail: company ? "Company record available" : "Company record needs review",
      state: company ? "ready" : "review", Icon: Building2,
    },
    {
      title: "Organization & teams", description: "Departments, reporting relationships and workspaces.",
      href: "/o/" + org.slug + "/workspace/spaces", detail: data.departments.length + " departments",
      state: data.departments.length ? "ready" : "review", Icon: Network,
    },
    {
      title: "People & access", description: "Team directory, invitations and membership preparation.",
      href: "/o/" + org.slug + "/workspace/people",
      detail: human.length + " people records · " + invitationDrafts.length + " invitations not sent",
      state: invitationDrafts.length ? "draft" : "review", Icon: Users,
    },
    {
      title: "Company Brain", description: "Company information, knowledge sources and evidence review.",
      href: appEntry("BRAIN",org.slug),
      detail: reviewedSources.length + " reviewed sources · " + (data.sources.length-reviewedSources.length) + " awaiting review",
      state: data.sources.length && reviewedSources.length === data.sources.length ? "ready" : "review", Icon: BookOpen,
    },
    {
      title: "AI workforce", description: "Specialist profiles, permitted tools and human supervision.",
      href: appEntry("TEAM",org.slug),
      detail: draftedAgents.length + " drafts · external execution not connected",
      state: "draft", Icon: Bot,
    },
    {
      title: "Applications & favourites", description: "Choose your favourite Arlovi apps and organise your workspace.",
      href: "/o/" + org.slug + "/workspace/apps",
      detail: pinnedApps.length + " pinned apps",
      state: "review", Icon: Grid2X2,
    },
    {
      title: "Integrations & connected accounts", description: "Find business software, authorise accounts, review access and connection health.",
      href: "/o/" + org.slug + "/connect/marketplace",
      detail: "Secure provider setup · approvals and activity",
      state: "connection", Icon: PlugZap,
    },
    {
      title: "Collaboration", description: "Communication spaces, notifications and shared work.",
      href: appEntry("COMMS",org.slug),
      detail: data.channels.length + " local channels",
      state: data.channels.length ? "ready" : "review", Icon: Users,
    },
    {
      title: "Governance & security", description: "Company approvals, AI policies and account readiness.",
      href: "/o/" + org.slug + "/workspace/account",
      detail: data.policies.length + " policy records · cloud identity not configured",
      state: "connection", Icon: ShieldCheck,
    },
  ];
  const readyCount = sections.filter(section => section.state === "ready").length;
  const canEdit = role === "owner";
  return <div className="setup-centre">
    <header className="setup-centre-header">
      <div><span className="setup-centre-eyebrow">COMPANY / OPERATING FOUNDATIONS</span><h1>Company Setup Centre</h1>
        <p>One place to review and refine the environment your business works in. Configuration stays connected to the native applications it controls.</p>
      </div>
      <Link className="setup-centre-back" to={"/o/" + org.slug + "/workspace/home"}>Back to My Workspace <ArrowRight size={16}/></Link>
    </header>
    <div className="setup-centre-overview">
      <div className="setup-centre-overview-icon" style={{borderColor:org.accent}}>{org.shortName.slice(0,1)}</div>
      <div className="setup-centre-overview-copy"><strong>{org.name}</strong><span>Browser-local headquarters · {org.currency} · {org.timezone}</span></div>
      <div className="setup-centre-overview-stat"><strong>{readyCount} of {sections.length}</strong><span>areas with local foundations</span></div>
    </div>
    <div className="setup-centre-guidance">
      <Compass size={20} aria-hidden="true"/>
      <div><strong>Set up what matters next.</strong><p>You don't need to finish every area to work. Select a section to open its native workspace. Setup isn't a claim that external services are connected or that invitations have been delivered.</p></div>
    </div>
    {!canEdit && <div className="setup-centre-boundary"><LockKeyhole size={18}/><p>You're viewing the {role} interface preview. This frontend's role selector is not verified account authorization; actual editing is controlled within local application views until a real identity service is connected.</p></div>}
    <div className="setup-centre-grid" aria-label="Company setup sections">
      {sections.map(({title,description,href,detail,state,Icon},index)=>
        <Link to={href} key={title} className="setup-centre-card">
          <span className="setup-centre-card-number">{String(index+1).padStart(2,"0")}</span>
          <span className="setup-centre-card-icon"><Icon size={19}/></span>
          <div className="setup-centre-card-main"><h2>{title}</h2><p>{description}</p></div>
          <div className="setup-centre-card-meta">
            <span className="setup-centre-state" data-state={state}>{state==="ready"?<CheckCircle2 size={13}/>:<CircleDot size={13}/>} {state==="ready"?"Local foundation":state==="connection"?"Provider review":state==="draft"?"Draft / review":"Needs review"}</span>
            <span className="setup-centre-card-detail">{detail}</span>
          </div>
          <ArrowRight size={18} className="setup-centre-card-arrow" aria-hidden="true"/>
        </Link>
      )}
    </div>
    <footer className="setup-centre-footer">
      <div><strong>Need a fresh orientation?</strong><p>Review your original getting-started guidance or explore the application directory without repeating company creation.</p></div>
      <div className="setup-centre-footer-links"><Link to={"/o/" + org.slug + "/workspace/home?gettingStarted=1"}>Getting-started guidance</Link><Link to={"/o/" + org.slug + "/workspace/apps"}>Explore applications</Link></div>
    </footer>
  </div>;
}
