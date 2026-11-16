import { useMemo, useState, type ComponentType } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, Building2, CalendarDays, CheckSquare, ChevronRight, FolderKanban, Grid2X2, Home, Inbox, Layers, Megaphone, Plus, Search, Users, Clock3, LockKeyhole, Activity } from "lucide-react";
import { APP_ENTRIES, NAV_GROUPS } from "@/app/nav";
import { ContextualCreate } from "@/app/ContextualCreate";
import { WorkspaceContinuity } from "@/app/WorkspaceContinuity";
import { ResourceLibrary } from "@/app/ResourceLibrary";
import { CompanyPeople } from "@/app/CompanyPeople";
import { AccountCloud } from "@/app/AccountCloud";
import { WorkspaceHealth } from "@/app/WorkspaceHealth";
import { TaskApprovalBoard } from "@/app/TaskApprovalBoard";
import { AgentWorkBoard } from "@/app/AgentWorkBoard";
import { appEntry } from "@/app/catalog";
import { routeForRecord } from "@/platform/attention";
import { canOpen } from "@/platform/policy";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./workspace-navigation.css";

/** Persistent destinations, distinct from the native application directory. */
export type WorkArea = "home" | "company" | "spaces" | "work" | "apps";
export const WORK_AREAS: { id: WorkArea; label: string; icon: typeof Home; description: string }[] = [
  { id: "home", label: "Home", icon: Home, description: "Your work and decisions" },
  { id: "company", label: "Company", icon: Building2, description: "Your organisation and its people" },
  { id: "spaces", label: "Spaces", icon: Users, description: "Departments and shared environments" },
  { id: "work", label: "Work", icon: FolderKanban, description: "Projects, missions and tasks" },
  { id: "apps", label: "Apps", icon: Grid2X2, description: "Native tools for every department" },
];
export function workAreaPath(slug: string, id: WorkArea): string {
  return `/o/${slug}/workspace/${id}`;
}
export function isWorkAreaPath(pathname: string, slug: string): boolean {
  return pathname.startsWith(`/o/${slug}/workspace/`);
}
export function currentWorkArea(pathname: string): WorkArea {
  const part = pathname.split("/")[4];
  return WORK_AREAS.find((area) => area.id === part)?.id ?? "home";
}
const headings: Record<WorkArea, string> = {
  home: "My Workspace", company: "Company Headquarters",
  spaces: "Spaces", work: "Work", apps: "Applications",
};
const collections = ["departments", "members", "projects", "missions", "tasks", "documents", "channels", "preferences", "objectives", "agents"];
const empty: Rec[] = [];

function RowLink({ to, title, detail, icon: Icon = ChevronRight }: { to: string; title: string; detail?: string; icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }) {
  return <Link className="ws-entry" to={to}><Icon size={18} aria-hidden="true" /><span className="ws-entry-text"><strong>{title}</strong>{detail && <small>{detail}</small>}</span><ArrowRight size={15} className="ws-entry-arrow" aria-hidden="true" /></Link>;
}
function WorkList({ title, records, slug, fallback }: { title: string; records: Rec[]; slug: string; fallback: string }) {
  return <section className="ws-section"><h2>{title}</h2>{records.length ? <div className="ws-entry-list">{records.map(record => <RowLink key={record.id} title={record.title} detail={`${record.status.replace(/_/g, " ")} · ${record.ownerName}`} to={routeForRecord(record, slug) ?? workAreaPath(slug, "work")} />)}</div> : <p className="ws-empty">{fallback}</p>}</section>;
}
function SpaceDetail({ record, kind, all, slug }: { record: Rec; kind: "department" | "project"; all: Record<string, Rec[]>; slug: string }) {
  const [tab, setTab] = useState("overview");
  const linked = (group: string) => (all[group] ?? empty).filter(item => item.parentId === record.id || item.fields.departmentId === record.id || item.fields.projectId === record.id);
  const tasks = linked("tasks"), projects = linked("projects"), docs = linked("documents"), agents = linked("agents"), channels = linked("channels");
  const tabs = ["overview", "work", "ai workforce", "approvals", "people", "files", "conversations", "activity"];
  return <div className="ws-content">
    <Link className="ws-back" to={workAreaPath(slug, kind === "department" ? "spaces" : "work")}>← {kind === "department" ? "Spaces" : "Work"}</Link>
    <header className="ws-page-head"><span className="ws-eyebrow">{kind === "department" ? "DEPARTMENT SPACE" : "PROJECT SPACE"}</span><h1>{record.title}</h1><p>{record.summary || "A shared place for this work and the people involved."}</p><div className="ws-page-actions"><ContextualCreate scope={{ type: kind, id: record.id, title: record.title }} label="Create in this space"/></div></header>
    <nav className="ws-tabs" aria-label={record.title + " sections"}>{tabs.map(t => <button key={t} type="button" onClick={() => setTab(t)} aria-current={tab === t ? "page" : undefined}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</nav>
    {tab === "overview" && <div className="ws-stack"><div className="ws-stat-grid"><div><small>Status</small><strong>{record.status.replace(/_/g," ")}</strong></div><div><small>Responsible</small><strong>{record.ownerName}</strong></div><div><small>Linked tasks</small><strong>{tasks.length}</strong></div></div>{kind === "department" && <section className="ws-section"><h2>Department projects</h2>{projects.length ? <div className="ws-entry-list">{projects.map(project => <RowLink key={project.id} to={`${workAreaPath(slug, "work")}/project/${project.id}`} title={project.title} detail={project.status} icon={FolderKanban}/>)}</div> : <p className="ws-empty">No projects linked to this department yet.</p>}</section>}<WorkList title="Related work" records={tasks.slice(0,8)} slug={slug} fallback="No tasks are linked to this space yet." /><WorkList title="Documents" records={docs.slice(0,6)} slug={slug} fallback="No linked documents yet." /></div>}
    {tab === "work" && <div className="ws-stack">{kind === "department" && <section className="ws-section"><h2>Projects</h2>{projects.length ? <div className="ws-entry-list">{projects.map(project => <RowLink key={project.id} to={`${workAreaPath(slug, "work")}/project/${project.id}`} title={project.title} icon={FolderKanban}/>)}</div> : <p className="ws-empty">No department projects yet.</p>}</section>}<WorkList title="Tasks in this space" records={tasks} slug={slug} fallback="No tasks linked to this space yet. Use Create in this space to add one." /></div>}
    {tab === "ai workforce" && <AgentWorkBoard scope={{type:kind,id:record.id}}/>}
    {tab === "approvals" && <TaskApprovalBoard scope={{type: kind, id: record.id}}/>}
    {tab === "people" && <div className="ws-stack"><CompanyPeople scope={{type:kind,id:record.id,title:record.title}}/><WorkList title="AI collaborators" records={agents} slug={slug} fallback="No AI collaborators linked." /></div>}
    {tab === "files" && <ResourceLibrary scope={{type:kind,id:record.id,title:record.title}}/>}
    {tab === "conversations" && <div className="ws-stack"><WorkList title="Linked channels" records={channels} slug={slug} fallback="No channels linked to this space." /><RowLink title="Open Communications" to={appEntry("COMMS",slug)} /></div>}
    {tab === "activity" && <div className="ws-stack"><p className="ws-note">Record last updated {new Date(record.updatedAt).toLocaleDateString()}. For the full audit history, open the source record.</p><RowLink title={"Open "+kind+" record"} to={routeForRecord(record,slug) ?? workAreaPath(slug,kind==="department"?"spaces":"work")} /></div>}
  </div>;
}

/** Contextual sidebar for the selected destination. */
export function WorkspaceSideNav() {
  const { org } = useWorkspace();
  const location = useLocation();
  const area = currentWorkArea(location.pathname);
  return <nav className="hq-appnav ws-sidebar" aria-label={headings[area] + " navigation"}>
    <div className="hq-appnav-head"><h2>{headings[area]}</h2><p>{WORK_AREAS.find(item=>item.id===area)?.description}</p></div>
    <div className="hq-appnav-body">{WORK_AREAS.map(item => <NavLink key={item.id} className="hq-navlink" to={workAreaPath(org.slug,item.id)}><item.icon size={16}/>{item.label}</NavLink>)}
      <NavLink className="hq-navlink" to={`/o/${org.slug}/workspace/recent`}><Clock3 size={16}/>Recent & saved</NavLink>
      <NavLink className="hq-navlink" to={`/o/${org.slug}/workspace/resources`}><FolderKanban size={16}/>Files & resources</NavLink>
      <NavLink className="hq-navlink" to={`/o/${org.slug}/workspace/people`}><Users size={16}/>People & collaboration</NavLink>
      <NavLink className="hq-navlink" to={`/o/${org.slug}/workspace/account`}><LockKeyhole size={16}/>Account & data</NavLink>
      <NavLink className="hq-navlink" to={`/o/${org.slug}/workspace/health`}><Activity size={16}/>Workspace health</NavLink>
      <div className="hq-navsection">TOOLS</div>
      <NavLink className="hq-navlink" to={appEntry("INBOX",org.slug)}><Inbox size={16}/>Inbox</NavLink>
      <NavLink className="hq-navlink" to={appEntry("PROJECT",org.slug)}><CheckSquare size={16}/>Projects</NavLink>
      <NavLink className="hq-navlink" to={appEntry("COMMS",org.slug)}><Users size={16}/>Communications</NavLink>
    </div>
  </nav>;
}
export function WorkspaceNavigation() {
  const { org, role, actor } = useWorkspace();
  const location = useLocation();
  const area = currentWorkArea(location.pathname);
  const data = useCollections(collections);
  const [query, setQuery] = useState("");
  const departments = data.departments ?? empty;
  const projects = data.projects ?? empty;
  const missions = data.missions ?? empty;
  const tasks = data.tasks ?? empty;
  const docs = data.documents ?? empty;
  const members = data.members ?? empty;
  const preferences = data.preferences ?? empty;
  const path = location.pathname.split("/");
  const detailKind = path[5] === "department" ? "department" : path[5] === "project" ? "project" : null;
  const detail = detailKind ? (detailKind === "department" ? departments : projects).find(item => item.id === path[6]) : undefined;
  const pinned = new Set(preferences.filter(p => p.fields.pinned === true).map(p => String(p.fields.app)));
  const appGroups = useMemo(() => NAV_GROUPS.map(group => ({ ...group, apps: group.apps.filter(app => canOpen(role, app.code) && (`${app.short} ${group.label}`).toLowerCase().includes(query.toLowerCase())) })).filter(group => group.apps.length), [role, query]);

  if (path[4] === "health") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / WORKSPACE OPERATIONS</span><h1>Workspace health</h1><p>Read-only checks for your company records, applications and browser storage.</p></header><WorkspaceHealth/></div>;
  if (path[4] === "account") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / DATA & IDENTITY</span><h1>Account & data readiness</h1><p>Understand local data, export a secure handoff archive, and see what is required for cloud accounts and synchronisation.</p></header><AccountCloud/></div>;
  if (path[4] === "people") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / COLLABORATION</span><h1>People & collaboration</h1><p>Manage the company directory and prepare workspace membership and invitations without claiming to grant account access.</p></header><CompanyPeople/></div>;
  if (path[4] === "resources") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / SHARED RESOURCES</span><h1>Files & resources</h1><p>Organise company documents into folders, preview content, and connect resources to projects and departments.</p><div className="ws-page-actions"><ContextualCreate label="Create document"/></div></header><ResourceLibrary/></div>;
  if (path[4] === "recent") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / CONTINUE WORKING</span><h1>Recent and saved work</h1><p>Return to the applications and workspaces you have opened in this organisation.</p></header><WorkspaceContinuity /></div>;
  if (detailKind) return detail ? <SpaceDetail key={detail.id} record={detail} kind={detailKind} all={data} slug={org.slug}/> : <div className="ws-content"><h1>Space not found</h1><p>This space is not available in this organisation.</p><Link to={workAreaPath(org.slug,area)}>Back to {headings[area]}</Link></div>;
  return <div className="ws-content">
    <header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / {headings[area].toUpperCase()}</span><h1>{area === "home" ? "Your day, in one place." : headings[area]}</h1><p>{WORK_AREAS.find(item => item.id === area)?.description}. Everything here belongs to the active organisation.</p>{area !== "apps" && <div className="ws-page-actions"><ContextualCreate label="Create new"/></div>}</header>
    {area === "home" && <div className="ws-stack">
      <WorkspaceContinuity compact />
      <div className="ws-stat-grid"><div><small>My assigned tasks</small><strong>{tasks.filter(t => t.ownerName === actor || t.fields.assignee === actor).length}</strong></div><div><small>Active projects</small><strong>{projects.filter(p => !["completed","archived","cancelled"].includes(p.status)).length}</strong></div><div><small>Open missions</small><strong>{missions.filter(m => !["completed","cancelled"].includes(m.status)).length}</strong></div></div>
      <WorkList title="Assigned work" records={tasks.filter(t=> t.ownerName === actor || t.fields.assignee === actor).slice(0,10)} slug={org.slug} fallback="No tasks currently assigned to this view." />
      <WorkList title="Recently updated documents" records={[...docs].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6)} slug={org.slug} fallback="No documents in this workspace yet." />
      <RowLink to={`/o/${org.slug}/workspace/resources`} title="Files & resources" detail="Browse company documents, folders and linked resources" icon={FolderKanban}/>
      <div className="ws-shortcuts"><RowLink to={appEntry("INBOX",org.slug)} title="Inbox and approvals" icon={Inbox} /><RowLink to={appEntry("BOOK",org.slug)} title="Calendar and bookings" icon={CalendarDays} /></div>
    </div>}
    {area === "company" && <div className="ws-stack"><div className="ws-stat-grid"><div><small>Departments</small><strong>{departments.length}</strong></div><div><small>People records</small><strong>{members.length}</strong></div><div><small>Active missions</small><strong>{missions.filter(m=>m.status==="running").length}</strong></div></div><WorkList title="Company objectives" records={(data.objectives ?? empty).slice(0,8)} slug={org.slug} fallback="No company objectives recorded."/><div className="ws-shortcuts"><RowLink to={appEntry("HQ",org.slug)} title="Executive headquarters" icon={Building2}/><RowLink to={appEntry("BRAIN",org.slug)} title="Company Brain" icon={Layers}/><RowLink to={appEntry("ADMIN",org.slug)} title="Company administration" icon={Users}/><RowLink to={`/o/${org.slug}/workspace/people`} title="People & collaboration" icon={Users}/><RowLink to={`/o/${org.slug}/workspace/account`} title="Account & data readiness" icon={LockKeyhole}/><RowLink to={`/o/${org.slug}/workspace/health`} title="Workspace health" icon={Activity}/></div></div>}
    {area === "spaces" && <div className="ws-stack"><section className="ws-section"><h2>Departments</h2><p className="ws-muted">Open a department's shared work, contributors, files and conversations.</p><div className="ws-entry-list">{departments.length ? departments.map(record => <RowLink key={record.id} to={`${workAreaPath(org.slug,"spaces")}/department/${record.id}`} title={record.title} detail={record.summary || record.status} icon={Megaphone}/>) : <p className="ws-empty">No departments in this organisation yet.</p>}</div></section><RowLink title="Manage departments and colleagues" to={appEntry("HQ",org.slug)} icon={Plus}/></div>}
    {area === "work" && <div className="ws-stack"><section className="ws-section"><h2>Projects</h2><div className="ws-entry-list">{projects.length ? projects.map(record => <RowLink key={record.id} to={`${workAreaPath(org.slug,"work")}/project/${record.id}`} title={record.title} detail={record.status.replace(/_/g," ")} icon={FolderKanban}/>) : <p className="ws-empty">No projects have been created in this company yet.</p>}</div></section><AgentWorkBoard/><TaskApprovalBoard/><WorkList title="Missions" records={missions.slice(0,12)} slug={org.slug} fallback="No mission records yet."/><div className="ws-shortcuts"><RowLink title="Project management" to={appEntry("PROJECT",org.slug)}/><RowLink title="Mission Control" to={appEntry("MISSION",org.slug)}/><RowLink title="Automation" to={appEntry("AUTO",org.slug)}/></div></div>}
    {area === "apps" && <div className="ws-stack"><label className="ws-app-search"><Search size={18}/><span className="ds-sr-only">Find an application</span><input aria-label="Find an application" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an application or category"/></label>{pinned.size>0 && <section className="ws-section"><h2>Pinned applications</h2><div className="ws-app-grid">{NAV_GROUPS.flatMap(g=>g.apps).filter(a=>pinned.has(a.short)&&canOpen(role,a.code)).map(app=><RowLink key={app.code} title={app.short} to={appEntry(app.code,org.slug)} icon={app.icon}/>)}</div></section>}{appGroups.map(group=><section className="ws-section" key={group.label}><h2>{group.label}</h2><div className="ws-app-grid">{group.apps.map(app=><RowLink key={app.code} title={app.short} to={appEntry(app.code,org.slug)} icon={APP_ENTRIES[app.code].icon}/>)}</div></section>)}{appGroups.length===0 && <p className="ws-empty">No applications match your search.</p>}</div>}
  </div>;
}
