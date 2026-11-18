import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2, CalendarDays, ChevronRight, FolderKanban, Grid2X2, Home, Inbox, Layers, Megaphone, Plus, Users, LockKeyhole, Activity } from "lucide-react";
import { ContextualCreate } from "@/app/ContextualCreate";
const WorkspaceHome = lazy(() => import("@/app/WorkspaceHome").then(module => ({ default: module.WorkspaceHome })));
const WorkspaceContinuity = lazy(() => import("@/app/WorkspaceContinuity").then(module => ({ default: module.WorkspaceContinuity })));
const ResourceLibrary = lazy(() => import("@/app/ResourceLibrary").then(module => ({ default: module.ResourceLibrary })));
const CompanyPeople = lazy(() => import("@/app/CompanyPeople").then(module => ({ default: module.CompanyPeople })));
const AccountCloud = lazy(() => import("@/app/AccountCloud").then(module => ({ default: module.AccountCloud })));
const WorkspaceHealth = lazy(() => import("@/app/WorkspaceHealth").then(module => ({ default: module.WorkspaceHealth })));
const AppsDirectory = lazy(() => import("@/app/AppsDirectory").then(module => ({ default: module.AppsDirectory })));
const TaskApprovalBoard = lazy(() => import("@/app/TaskApprovalBoard").then(module => ({ default: module.TaskApprovalBoard })));
const AgentWorkBoard = lazy(() => import("@/app/AgentWorkBoard").then(module => ({ default: module.AgentWorkBoard })));
import { appEntry } from "@/app/catalog";
import { routeForRecord } from "@/platform/attention";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./workspace-navigation.css";
import { workspacePrimaryArea } from "@/app/workspaceSidebarModel";
export { WorkspaceSideNav } from "@/app/WorkspaceSideNav";

/** Each specialist surface loads independently, preserving navigation while awaiting its code. */
function DeferredPanel({ children }: { children: ReactNode }) {
  return <Suspense fallback={<section className="ws-section ws-deferred-loading" role="status" aria-busy="true"><span className="ds-spinner" aria-hidden="true"/> Loading workspace content…</section>}>{children}</Suspense>;
}

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
  return workspacePrimaryArea(pathname) ?? WORK_AREAS.find((area) => area.id === part)?.id ?? "home";
}
const headings: Record<WorkArea, string> = {
  home: "My Workspace", company: "Company Headquarters",
  spaces: "Spaces", work: "Work", apps: "Applications",
};
const collections = ["departments", "members", "projects", "missions", "tasks", "documents", "channels", "objectives", "agents"];
const empty: Rec[] = [];

function RowLink({ to, title, detail, icon: Icon = ChevronRight }: { to: string; title: string; detail?: string; icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }) {
  return <Link className="ws-entry" to={to}><Icon size={18} aria-hidden="true" /><span className="ws-entry-text"><strong>{title}</strong>{detail && <small>{detail}</small>}</span><ArrowRight size={15} className="ws-entry-arrow" aria-hidden="true" /></Link>;
}
function WorkList({ title, records, slug, fallback }: { title: string; records: Rec[]; slug: string; fallback: string }) {
  return <section className="ws-section"><h2>{title}</h2>{records.length ? <div className="ws-entry-list">{records.map(record => <RowLink key={record.id} title={record.title} detail={`${record.status.replace(/_/g, " ")} · ${record.ownerName}`} to={routeForRecord(record, slug) ?? workAreaPath(slug, "work")} />)}</div> : <p className="ws-empty">{fallback}</p>}</section>;
}
function SpaceDetail({ record, kind, all, slug }: { record: Rec; kind: "department" | "project"; all: Record<string, Rec[]>; slug: string }) {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab") ?? "overview";
  const linked = (group: string) => (all[group] ?? empty).filter(item => item.parentId === record.id || item.fields.departmentId === record.id || item.fields.projectId === record.id);
  const tasks = linked("tasks"), projects = linked("projects"), docs = linked("documents"), agents = linked("agents"), channels = linked("channels");
  const tabs = ["overview", "work", "ai workforce", "approvals", "people", "files", "conversations", "activity"];
  const tab = tabs.includes(requestedTab) ? requestedTab : "overview";
  const changeTab = (next: string) => {
    const updated = new URLSearchParams(params);
    if (next === "overview") updated.delete("tab"); else updated.set("tab",next);
    setParams(updated);
  };
  return <div className="ws-content">
    <Link className="ws-back" to={workAreaPath(slug, kind === "department" ? "spaces" : "work")}>← {kind === "department" ? "Spaces" : "Work"}</Link>
    <header className="ws-page-head"><span className="ws-eyebrow">{kind === "department" ? "DEPARTMENT SPACE" : "PROJECT SPACE"}</span><h1>{record.title}</h1><p>{record.summary || "A shared place for this work and the people involved."}</p><div className="ws-page-actions"><ContextualCreate scope={{ type: kind, id: record.id, title: record.title }} label="Create in this space"/></div></header>
    <nav className="ws-tabs" aria-label={record.title + " sections"}>{tabs.map(t => <button key={t} type="button" onClick={() => changeTab(t)} aria-current={tab === t ? "page" : undefined}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>)}</nav>
    {tab === "overview" && <div className="ws-stack"><div className="ws-stat-grid"><div><small>Status</small><strong>{record.status.replace(/_/g," ")}</strong></div><div><small>Responsible</small><strong>{record.ownerName}</strong></div><div><small>Linked tasks</small><strong>{tasks.length}</strong></div></div>{kind === "department" && <section className="ws-section"><h2>Department projects</h2>{projects.length ? <div className="ws-entry-list">{projects.map(project => <RowLink key={project.id} to={`${workAreaPath(slug, "work")}/project/${project.id}`} title={project.title} detail={project.status} icon={FolderKanban}/>)}</div> : <p className="ws-empty">No projects linked to this department yet.</p>}</section>}<WorkList title="Related work" records={tasks.slice(0,8)} slug={slug} fallback="No tasks are linked to this space yet." /><WorkList title="Documents" records={docs.slice(0,6)} slug={slug} fallback="No linked documents yet." /></div>}
    {tab === "work" && <div className="ws-stack">{kind === "department" && <section className="ws-section"><h2>Projects</h2>{projects.length ? <div className="ws-entry-list">{projects.map(project => <RowLink key={project.id} to={`${workAreaPath(slug, "work")}/project/${project.id}`} title={project.title} icon={FolderKanban}/>)}</div> : <p className="ws-empty">No department projects yet.</p>}</section>}<WorkList title="Tasks in this space" records={tasks} slug={slug} fallback="No tasks linked to this space yet. Use Create in this space to add one." /></div>}
    {tab === "ai workforce" && <DeferredPanel><AgentWorkBoard scope={{type:kind,id:record.id}}/></DeferredPanel>}
    {tab === "approvals" && <DeferredPanel><TaskApprovalBoard scope={{type: kind, id: record.id}}/></DeferredPanel>}
    {tab === "people" && <div className="ws-stack"><DeferredPanel><CompanyPeople scope={{type:kind,id:record.id,title:record.title}}/></DeferredPanel><WorkList title="AI collaborators" records={agents} slug={slug} fallback="No AI collaborators linked." /></div>}
    {tab === "files" && <DeferredPanel><ResourceLibrary scope={{type:kind,id:record.id,title:record.title}}/></DeferredPanel>}
    {tab === "conversations" && <div className="ws-stack"><WorkList title="Linked channels" records={channels} slug={slug} fallback="No channels linked to this space." /><RowLink title="Open Communications" to={appEntry("COMMS",slug)} /></div>}
    {tab === "activity" && <div className="ws-stack"><p className="ws-note">Record last updated {new Date(record.updatedAt).toLocaleDateString()}. For the full audit history, open the source record.</p><RowLink title={"Open "+kind+" record"} to={routeForRecord(record,slug) ?? workAreaPath(slug,kind==="department"?"spaces":"work")} /></div>}
  </div>;
}

export function WorkspaceNavigation() {
  const { org, actor } = useWorkspace();
  const location = useLocation();
  const area = currentWorkArea(location.pathname);
  const data = useCollections(collections);
  const departments = data.departments ?? empty;
  const projects = data.projects ?? empty;
  const missions = data.missions ?? empty;
  const tasks = data.tasks ?? empty;
  const docs = data.documents ?? empty;
  const members = data.members ?? empty;
  const path = location.pathname.split("/");
  const detailKind = path[5] === "department" ? "department" : path[5] === "project" ? "project" : null;
  const detail = detailKind ? (detailKind === "department" ? departments : projects).find(item => item.id === path[6]) : undefined;

  if (path[4] === "health") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / WORKSPACE OPERATIONS</span><h1>Workspace health</h1><p>Read-only checks for your company records, applications and browser storage.</p></header><DeferredPanel><WorkspaceHealth/></DeferredPanel></div>;
  if (path[4] === "account") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / DATA & IDENTITY</span><h1>Account & data readiness</h1><p>Understand local data, export a secure handoff archive, and see what is required for cloud accounts and synchronisation.</p></header><DeferredPanel><AccountCloud/></DeferredPanel></div>;
  if (path[4] === "people") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / COLLABORATION</span><h1>People & collaboration</h1><p>Manage the company directory and prepare workspace membership and invitations without claiming to grant account access.</p></header><DeferredPanel><CompanyPeople/></DeferredPanel></div>;
  if (path[4] === "resources") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / SHARED RESOURCES</span><h1>Files & resources</h1><p>Organise company documents into folders, preview content, and connect resources to projects and departments.</p><div className="ws-page-actions"><ContextualCreate label="Create document"/></div></header><DeferredPanel><ResourceLibrary/></DeferredPanel></div>;
  if (path[4] === "recent") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / CONTINUE WORKING</span><h1>Recent and saved work</h1><p>Return to the applications and workspaces you have opened in this organisation.</p></header><DeferredPanel><WorkspaceContinuity /></DeferredPanel></div>;
  if (detailKind) return detail ? <SpaceDetail key={detail.id} record={detail} kind={detailKind} all={data} slug={org.slug}/> : <div className="ws-content"><h1>Space not found</h1><p>This space is not available in this organisation.</p><Link to={workAreaPath(org.slug,area)}>Back to {headings[area]}</Link></div>;
  return <div className="ws-content">
    {area !== "home" && <header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / {headings[area].toUpperCase()}</span><h1>{area === "home" ? "Your day, in one place." : headings[area]}</h1><p>{area === "apps" ? "Find the right tool for your work, or pick up where you left off. Each application opens in this company." : WORK_AREAS.find(item => item.id === area)?.description + ". Everything here belongs to the active organisation."}</p>{area !== "apps" && <div className="ws-page-actions"><ContextualCreate label="Create new"/></div>}</header>}
    {area === "home" && <DeferredPanel><WorkspaceHome orgName={org.name} slug={org.slug} actor={actor} tasks={tasks} projects={projects} missions={missions} docs={docs} continuity={<DeferredPanel><WorkspaceContinuity compact/></DeferredPanel>}/></DeferredPanel>}
    {area === "company" && <div className="ws-stack"><div className="ws-stat-grid"><div><small>Departments</small><strong>{departments.length}</strong></div><div><small>People records</small><strong>{members.length}</strong></div><div><small>Active missions</small><strong>{missions.filter(m=>m.status==="running").length}</strong></div></div><WorkList title="Company objectives" records={(data.objectives ?? empty).slice(0,8)} slug={org.slug} fallback="No company objectives recorded."/><div className="ws-shortcuts"><RowLink to={appEntry("HQ",org.slug)} title="Executive headquarters" icon={Building2}/><RowLink to={appEntry("BRAIN",org.slug)} title="Company Brain" icon={Layers}/><RowLink to={appEntry("ADMIN",org.slug)} title="Company administration" icon={Users}/><RowLink to={`/o/${org.slug}/workspace/people`} title="People & collaboration" icon={Users}/><RowLink to={`/o/${org.slug}/workspace/account`} title="Account & data readiness" icon={LockKeyhole}/><RowLink to={`/o/${org.slug}/workspace/health`} title="Workspace health" icon={Activity}/></div></div>}
    {area === "spaces" && <div className="ws-stack"><section className="ws-section"><h2>Departments</h2><p className="ws-muted">Open a department's shared work, contributors, files and conversations.</p><div className="ws-entry-list">{departments.length ? departments.map(record => <RowLink key={record.id} to={`${workAreaPath(org.slug,"spaces")}/department/${record.id}`} title={record.title} detail={record.summary || record.status} icon={Megaphone}/>) : <p className="ws-empty">No departments in this organisation yet.</p>}</div></section><RowLink title="Manage departments and colleagues" to={appEntry("HQ",org.slug)} icon={Plus}/></div>}
    {area === "work" && <div className="ws-stack"><section className="ws-section"><h2>Projects</h2><div className="ws-entry-list">{projects.length ? projects.map(record => <RowLink key={record.id} to={`${workAreaPath(org.slug,"work")}/project/${record.id}`} title={record.title} detail={record.status.replace(/_/g," ")} icon={FolderKanban}/>) : <p className="ws-empty">No projects have been created in this company yet.</p>}</div></section><DeferredPanel><AgentWorkBoard/></DeferredPanel><DeferredPanel><TaskApprovalBoard/></DeferredPanel><WorkList title="Missions" records={missions.slice(0,12)} slug={org.slug} fallback="No mission records yet."/><div className="ws-shortcuts"><RowLink title="Project management" to={appEntry("PROJECT",org.slug)}/><RowLink title="Mission Control" to={appEntry("MISSION",org.slug)}/><RowLink title="Automation" to={appEntry("AUTO",org.slug)}/></div></div>}
    {area === "apps" && <DeferredPanel><AppsDirectory /></DeferredPanel>}
  </div>;
}
