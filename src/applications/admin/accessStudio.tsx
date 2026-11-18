import { useMemo, useState } from "react";
import { ArrowUpRight, BriefcaseBusiness, ChevronRight, Eye, LockKeyhole, Search, ShieldCheck, ShieldX, Users } from "lucide-react";
import { Button, Notice, Pill, TextInput } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { ROLE_TEMPLATES, templateOffersApp } from "@/platform/accessModel";
import { ACCESS_APPLICATION_INVENTORY, accessInventoryCoverage } from "@/platform/accessInventory";
import { canOpen, ROLE_LABELS } from "@/platform/policy";
import "./access-studio.css";

const SCOPES = [
  {name:"Own & assigned",detail:"Only records created for, owned by or explicitly assigned to this person"},
  {name:"Team / department",detail:"Records belonging to their authorised teams or departments"},
  {name:"Business unit",detail:"Approved legal entities or subdivisions only"},
  {name:"Organisation",detail:"Relevant company-wide records, still subject to confidentiality rules"},
  {name:"Specific resources",detail:"Explicitly shared documents, projects, customers or work items"},
];

const ACTIONS = [
  {name:"View & discover",detail:"Browse the app and open permitted resources"},
  {name:"Create & edit",detail:"Add or change assigned business records"},
  {name:"Collaborate",detail:"Comment, mention, share and assign"},
  {name:"Approve & publish",detail:"Approve work, money, public content or deployments"},
  {name:"Export & delete",detail:"Take data out or permanently remove it"},
  {name:"Administer",detail:"Manage permissions, integrations, credentials and policy"},
];

export function AccessStudio({ context }: { context: ScreenContext }) {
  const [roleId, setRoleId] = useState("managing_director");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const [selectedApp, setSelectedApp] = useState("FIN");
  const [onlyIncluded, setOnlyIncluded] = useState(false);
  const selectedRole = ROLE_TEMPLATES.find(role => role.id === roleId) ?? ROLE_TEMPLATES[0];
  const allGroups = Array.from(new Set(ACCESS_APPLICATION_INVENTORY.map(app => app.group)));
  const matches = useMemo(() => ACCESS_APPLICATION_INVENTORY.filter(app =>
    (group === "All" || app.group === group)
    && (!onlyIncluded || templateOffersApp(roleId, app.code))
    && (!query.trim() || `${app.short} ${app.code} ${app.pages.map(page => page.title).join(" ")}`
      .toLowerCase().includes(query.trim().toLowerCase()))
  ), [group, query, roleId, onlyIncluded]);
  const chosenApp = ACCESS_APPLICATION_INVENTORY.find(app => app.code === selectedApp);
  const included = ACCESS_APPLICATION_INVENTORY.filter(app => templateOffersApp(roleId, app.code)).length;
  const inventory = accessInventoryCoverage();

  return <section className="ax-studio" aria-label="Roles and application access explorer">
    <div className="ax-intro">
      <div className="ax-title">
        <span className="ax-overline"><ShieldCheck size={14}/> ACCESS ARCHITECTURE</span>
        <h2>Understand every role. Control every surface.</h2>
        <p>Review suggested access across applications, screens, sensitive records and actions. Drafts and previews do not grant real access.</p>
      </div>
      <div className="ax-stats">
        <div><strong>{ROLE_TEMPLATES.length}</strong><span>Role templates</span></div>
        <div><strong>{inventory.apps}</strong><span>Applications</span></div>
        <div><strong>{inventory.screens}</strong><span>Screen contracts</span></div>
      </div>
    </div>
    <Notice tone="warning" title="Access preview — not authentication">
      These are proposed role templates and a browser-local role view. A connected, authenticated backend is required
      to enforce data, fields, APIs, files, AI agents and organisation isolation. Do not use this preview as proof of access.
    </Notice>
    <div className="ax-layout">
      <section className="ax-roles" aria-label="Role templates">
        <div className="ax-panel-title"><Users size={16}/><h3>Role templates</h3></div>
        <div className="ax-roles-list">
          {ROLE_TEMPLATES.map(role => <button type="button" key={role.id} onClick={() => setRoleId(role.id)}
            aria-pressed={roleId === role.id} className="ax-role">
            <span className="ax-role-avatar"><BriefcaseBusiness size={16}/></span>
            <span><strong>{role.title}</strong><small>{role.audience}</small></span>
            <ChevronRight size={14}/>
          </button>)}
        </div>
      </section>
      <div className="ax-primary">
        <div className="ax-current">
          <div>
            <span className="ax-overline">SELECTED TEMPLATE</span>
            <h3>{selectedRole.title}</h3>
            <p>{selectedRole.description}</p>
            <div className="ax-role-meta"><Pill>{selectedRole.audience}</Pill><Pill tone="info">{included} suggested applications</Pill></div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => context.openOverlay("Policy editor")}>
            Review custom roles <ArrowUpRight size={14}/>
          </Button>
        </div>
        <div className="ax-group-tabs" role="group" aria-label="Application category filter">
          {["All", ...allGroups].map(name => <button key={name} type="button"
            aria-pressed={group===name} onClick={() => setGroup(name)}>{name}</button>)}
        </div>
        <div className="ax-toolbar">
          <label className="ax-search"><Search size={15}/><TextInput type="search" value={query} onChange={event=>setQuery(event.target.value)}
            placeholder="Search apps and pages" aria-label="Search access inventory"/></label>
          <label className="ax-included"><input type="checkbox" checked={onlyIncluded} onChange={event=>setOnlyIncluded(event.target.checked)}/> Suggested only</label>
        </div>
        <div className="ax-app-matrix" aria-label="Native application access matrix">
          {matches.map(app => {
            const suggested = templateOffersApp(roleId, app.code);
            const current = canOpen(context.role, app.code);
            return <button type="button" key={app.code} onClick={() => setSelectedApp(app.code)}
              aria-pressed={selectedApp === app.code} className="ax-app">
              <span className="ax-app-status">{suggested?<ShieldCheck size={18}/>:<LockKeyhole size={18}/>}</span>
              <span><strong>{app.short}</strong><small>{app.pages.length} pages · {app.group}</small></span>
              <span className="ax-app-permissions">
                <em data-suggested={suggested}>{suggested?"Suggested":"Not default"}</em>
                <small>Current {ROLE_LABELS[context.role]}: {current?"shown":"hidden"}</small>
              </span>
            </button>;
          })}
          {matches.length===0 && <div className="ax-no-results">No applications match these filters.</div>}
        </div>
      </div>
      <aside className="ax-detail" aria-label="Selected application permissions">
        <div className="ax-panel-title"><Eye size={16}/><h3>Application detail</h3></div>
        {chosenApp && <>
          <h4>{chosenApp.short}</h4>
          <p>{chosenApp.group} · {chosenApp.pages.length} registered screens</p>
          <div className="ax-detail-state">
            {templateOffersApp(roleId, chosenApp.code) ? <Pill tone="success">Suggested access</Pill> : <Pill>Not in template</Pill>}
            <span>Page visibility and record access are separate.</span>
          </div>
          <div className="ax-detail-heading">SCREEN INVENTORY</div>
          <div className="ax-screen-list">
            {chosenApp.pages.map(page => <div key={page.id}>
              <span><strong>{page.title}</strong><small>{page.id}</small></span>
              {page.classification==="restricted"?<ShieldX size={14} className="ax-sensitive"/>:
                page.classification==="confidential"?<LockKeyhole size={14}/>:<ShieldCheck size={14}/>}
            </div>)}
          </div>
          <div className="ax-detail-legend"><span><ShieldCheck size={13}/> Internal</span><span><LockKeyhole size={13}/> Confidential</span><span><ShieldX size={13}/> Restricted</span></div>
          <p className="ax-disclaimer">Sensitivity labels are inventory hints. Real field-level restrictions and individual record permissions must be checked by the server.</p>
        </>}
      </aside>
    </div>
    <div className="ax-foundations">
      <section><div className="ax-panel-title"><LockKeyhole size={16}/><h3>Data scopes</h3></div>
        {SCOPES.map(item=><div className="ax-principle" key={item.name}><strong>{item.name}</strong><span>{item.detail}</span></div>)}
      </section>
      <section><div className="ax-panel-title"><ShieldCheck size={16}/><h3>Action authority</h3></div>
        {ACTIONS.map(item=><div className="ax-principle" key={item.name}><strong>{item.name}</strong><span>{item.detail}</span></div>)}
      </section>
    </div>
    <Notice tone="info" title="Current role view">
      Your selected browser role is {ROLE_LABELS[context.role]}. Its existing application and capability rules are shown separately
      from these proposed job-title templates. No role has been assigned and no policy has been published.
    </Notice>
  </section>;
}
