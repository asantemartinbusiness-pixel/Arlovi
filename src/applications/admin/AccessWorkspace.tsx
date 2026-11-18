import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, FilePenLine, KeyRound, LockKeyhole, Search, ShieldCheck, UserCog, Users } from "lucide-react";
import { applications } from "@/app/catalog";
import { NAV_GROUPS } from "@/app/nav";
import { useWorkspace } from "@/platform/workspace";
import { canOpen, ROLE_LABELS } from "@/platform/policy";
import {
  ROLE_TEMPLATES, applicationsForRoleTemplate, defaultLegacyTemplate,
  evaluateAccess, screenAccessCatalogue, isSensitiveScreen, type AccessAction,
  type AccessPrincipal, type AccessScope, type AccessResource, type ResourceClassification,
} from "@/platform/accessModel";
import type { ScreenContext } from "@/platform/registry";
import { AccessPermissionMatrix } from "./AccessPermissionMatrix";
import "./access-workspace.css";

type Lens = "applications" | "pages" | "simulation" | "permissions";
const ACTIONS:AccessAction[]=["discover","open","view","create","edit","comment","assign","approve","publish","export","share","delete","manage"];
const SCOPES:AccessScope[]=["none","own","assigned","team","department","business_unit","organization","explicit"];
const CLASSES:ResourceClassification[]=["public","internal","confidential","restricted"];
const PERMISSION_HELP = "Preview only. Your signed-in identity, actual data permissions and backend authorisation are not configured in this browser-local product.";

export function AccessWorkspace({ detailed = false, context }: { detailed?: boolean; context: ScreenContext }) {
  const { org, role } = useWorkspace();
  const [selectedRole,setSelectedRole]=useState(defaultLegacyTemplate(role));
  const [lens,setLens]=useState<Lens>(detailed?"simulation":"applications");
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("All");
  const [selectedApp,setSelectedApp]=useState("FIN");
  const [action,setAction]=useState<AccessAction>("view");
  const [classification,setClassification]=useState<ResourceClassification>("internal");
  const [scope,setScope]=useState<AccessScope>("assigned");
  const [explicit,setExplicit]=useState(false);
  const [deny,setDeny]=useState(false);
  const apps=useMemo(()=>applicationsForRoleTemplate(selectedRole),[selectedRole]);
  const appNames=useMemo(()=>new Map(applications.map(app=>[app.code,app.name])),[]);
  const catalogue=useMemo(()=>screenAccessCatalogue(),[]);
  const filtered=useMemo(()=>applications.filter(app=>
    (category==="All"||NAV_GROUPS.some(g=>g.label===category&&g.apps.some(entry=>entry.code===app.code))) &&
    `${app.code} ${app.name} ${app.purpose}`.toLowerCase().includes(query.toLowerCase())
  ),[category,query]);
  const screenRows=useMemo(()=>catalogue.filter(page=>page.app===selectedApp &&
    page.title.toLowerCase().includes(query.toLowerCase())),[selectedApp,query,catalogue]);
  const sampleSubject:AccessPrincipal={
    subjectId:"access-preview",organizationId:org.id,kind:"human",roleIds:[selectedRole],
    grants:explicit?[{application:selectedApp,action,scope,effect:deny?"deny":"allow",resourceId:"preview-resource",classificationMax:classification}]:[],
    departmentIds:["preview-department"],teamIds:["preview-team"],
  };
  const sampleResource:AccessResource={
    organizationId:org.id,application:selectedApp,id:"preview-resource",
    ownerId:scope==="own"||scope==="assigned"?"access-preview":"somebody-else",
    assigneeIds:scope==="assigned"?["access-preview"]:[],
    teamId:"preview-team",departmentId:"preview-department",
    classification,
  };
  const outcome=evaluateAccess(sampleSubject,sampleResource,action);
  const legacyApps=applications.filter(app=>canOpen(role,app.code)).length;
  const members=ROLE_TEMPLATES.filter(t=>t.family!=="automation").length;
  return <section className="aw-root" aria-label="Roles and application access workspace">
    <div className="aw-intro">
      <div><span className="aw-kicker"><ShieldCheck size={13}/> IDENTITY / ACCESS DESIGN</span>
        <h2>Understand who can access what.</h2>
        <p>Explore recommended role templates, review application and screen coverage, and simulate resource-level decisions without changing employee access.</p>
      </div>
      <div className="aw-metrics">
        <span><strong>{applications.length}</strong><small>Native apps</small></span>
        <span><strong>{catalogue.length}</strong><small>Screens</small></span>
        <span><strong>{ROLE_TEMPLATES.length}</strong><small>Templates</small></span>
      </div>
    </div>
    <div className="aw-boundary"><LockKeyhole size={17}/><div><strong>Access-design preview, not an active security policy</strong>
      <p>{PERMISSION_HELP} The current {ROLE_LABELS[role]} view offers {legacyApps} applications. Proposed roles do not grant real access.</p>
    </div></div>
    <div className="aw-selector">
      <label htmlFor="aw-role">Inspect role template</label>
      <select id="aw-role" value={selectedRole} onChange={e=>setSelectedRole(e.target.value)}>
        {ROLE_TEMPLATES.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}
      </select>
      <div className="aw-selected-summary"><Users size={15}/>{ROLE_TEMPLATES.find(t=>t.id===selectedRole)?.description}</div>
      <button type="button" className="aw-perm-open" onClick={()=>setLens("permissions")}><FilePenLine size={15}/> Configure view & edit rights <ArrowRight size={14}/></button>
    </div>
    <div className="aw-tabs" role="group" aria-label="Permission exploration mode">
      <button type="button" aria-pressed={lens==="permissions"} onClick={()=>{setLens("permissions");setQuery("");}}><FilePenLine size={15}/> View & edit rights</button>
      <button type="button" aria-pressed={lens==="applications"} onClick={()=>setLens("applications")}><UserCog size={15}/> Applications</button>
      <button type="button" aria-pressed={lens==="pages"} onClick={()=>{setLens("pages");setQuery("");}}><Eye size={15}/> Pages & sensitive data</button>
      <button type="button" aria-pressed={lens==="simulation"} onClick={()=>{setLens("simulation");setQuery("");}}><KeyRound size={15}/> Permission simulator</button>
    </div>
    {lens==="permissions"&&<AccessPermissionMatrix key={selectedRole} roleId={selectedRole} context={context}/>}
    {lens!=="simulation"&&lens!=="permissions"&&<div className="aw-filter">
      <label className="aw-search"><Search size={15}/><input type="search" placeholder={lens==="pages"?"Find a screen":"Find applications"} value={query} onChange={e=>setQuery(e.target.value)} aria-label="Search access catalogue"/></label>
      {lens==="applications"&&<select aria-label="Application category" value={category} onChange={e=>setCategory(e.target.value)}>
        <option value="All">All application groups</option>{NAV_GROUPS.map(g=><option key={g.label} value={g.label}>{g.label}</option>)}
      </select>}
    </div>}
    {lens==="applications"&&<div className="aw-app-groups">
      {NAV_GROUPS.filter(g=>category==="All"||g.label===category).map(group=>{
        const rows=filtered.filter(app=>group.apps.some(entry=>entry.code===app.code));
        if(!rows.length)return null;
        return <div className="aw-app-group" key={group.label}>
          <div className="aw-group-heading"><strong>{group.label}</strong><span>{rows.length} applications</span></div>
          <div className="aw-app-grid">{rows.map(app=>{
            const allowed=apps.includes(app.code);
            return <button type="button" key={app.code} className="aw-app-tile" data-allowed={allowed} onClick={()=>{setSelectedApp(app.code);setLens("pages");setQuery("");}}>
              <span className="aw-app-symbol">{allowed?<CheckCircle2 size={17}/>:<EyeOff size={17}/>}</span>
              <span className="aw-app-name"><strong>{app.name}</strong><small>{app.code}</small></span>
              <span className="aw-permission">{allowed?"Template access":"Not in template"}</span>
              <ArrowRight size={13}/>
            </button>;
          })}</div>
        </div>;
      })}
    </div>}
    {lens==="pages"&&<div className="aw-pages">
      <div className="aw-page-heading"><div><strong>Application screens</strong><span>Select an application to inspect its registered pages and sensitive areas.</span></div>
        <select aria-label="Application to inspect" value={selectedApp} onChange={e=>setSelectedApp(e.target.value)}>
          {applications.map(app=><option key={app.code} value={app.code}>{app.name}</option>)}
        </select></div>
      <div className="aw-screen-list">
        {screenRows.map(page=><div key={page.screen} className="aw-screen-row">
          <span className="aw-screen-icon">{page.sensitive?<LockKeyhole size={15}/>:<Eye size={15}/>}</span>
          <div><strong>{page.title}</strong><small>{page.screen}</small></div>
          <span className="aw-screen-label">{page.sensitive?"Sensitive — explicit scope required":apps.includes(page.app)?"Template view":"Not in template"}</span>
        </div>)}
        {!screenRows.length&&<div className="aw-empty">No matching screens in this application.</div>}
      </div>
      <p className="aw-note">Sensitive classifications are proposed for policy design. They are not enforced by the current frontend or an authenticated backend.</p>
    </div>}
    {lens==="simulation"&&<div className="aw-simulation">
      <div className="aw-simulation-fields">
        <label>Application<select value={selectedApp} onChange={e=>setSelectedApp(e.target.value)}>
          {applications.map(app=><option value={app.code} key={app.code}>{app.name}</option>)}</select></label>
        <label>Action<select value={action} onChange={e=>setAction(e.target.value as AccessAction)}>
          {ACTIONS.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
        <label>Resource classification<select value={classification} onChange={e=>setClassification(e.target.value as ResourceClassification)}>
          {CLASSES.map(c=><option key={c} value={c}>{c}</option>)}</select></label>
        <label>Resource scope<select value={scope} onChange={e=>setScope(e.target.value as AccessScope)}>
          {SCOPES.map(sc=><option key={sc} value={sc}>{sc.replaceAll("_"," ")}</option>)}</select></label>
      </div>
      <div className="aw-checkboxes">
        <label><input type="checkbox" checked={explicit} onChange={e=>setExplicit(e.target.checked)}/> Add explicit example grant</label>
        <label><input type="checkbox" checked={deny} disabled={!explicit} onChange={e=>setDeny(e.target.checked)}/> Explicit deny</label>
      </div>
      <div className="aw-decision" data-allowed={outcome.allowed}>
        {outcome.allowed?<CheckCircle2 size={22}/>:<LockKeyhole size={22}/>}
        <div><strong>{outcome.allowed?"Would be allowed":"Would be refused"}</strong>
          <p>Reason: {outcome.reason.replaceAll("_"," ")}{outcome.source?` · ${outcome.source}`:""}. This is an illustrative policy evaluation, not authorisation to access real data.</p>
        </div>
      </div>
      <div className="aw-crosschecks"><strong>Policy characteristics</strong>
        <span>Explicit restrictions override grants</span><span>Organisation boundaries are mandatory</span>
        <span>Confidential records need an explicit grant</span><span>AI identities receive no default tools</span>
      </div>
    </div>}
    <div className="aw-footer"><span>Role templates are a proposed target model; current legacy role policies remain unchanged.</span><span>{members} human/external templates · {isSensitiveScreen(selectedApp,screenRows[0]?.title??"")?"Sensitive page selected":appNames.get(selectedApp)}</span></div>
  </section>;
}
