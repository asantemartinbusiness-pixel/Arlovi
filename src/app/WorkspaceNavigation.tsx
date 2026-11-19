import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowRight, Building2, ChevronRight, FolderKanban, Grid2X2, Home, Layers, Megaphone, Plus, Users, LockKeyhole, Activity, CheckCircle2, CircleDot, FileText, MessageSquare, Sparkles, Clock3 } from "lucide-react";
import { ContextualCreate } from "@/app/ContextualCreate";
const WorkspaceActivity = lazy(() => import("@/app/WorkspaceActivity").then(module => ({ default: module.WorkspaceActivity })));
const WorkspaceTaskDesk = lazy(() => import("@/app/WorkspaceTaskDesk").then(module => ({ default: module.WorkspaceTaskDesk })));
const WorkspaceWork = lazy(() => import("@/app/WorkspaceWork").then(module => ({ default: module.WorkspaceWork })));
const WorkspaceHome = lazy(() => import("@/app/WorkspaceHome").then(module => ({ default: module.WorkspaceHome })));
const WorkspaceContinuity = lazy(() => import("@/app/WorkspaceContinuity").then(module => ({ default: module.WorkspaceContinuity })));
const ResourceLibrary = lazy(() => import("@/app/ResourceLibrary").then(module => ({ default: module.ResourceLibrary })));
const CompanyPeople = lazy(() => import("@/app/CompanyPeople").then(module => ({ default: module.CompanyPeople })));
const AccountCloud = lazy(() => import("@/app/AccountCloud").then(module => ({ default: module.AccountCloud })));
const WorkspaceHealth = lazy(() => import("@/app/WorkspaceHealth").then(module => ({ default: module.WorkspaceHealth })));
const CompanySetupCentre = lazy(() => import("@/app/CompanySetupCentre").then(module => ({ default: module.CompanySetupCentre })));
const AppsDirectory = lazy(() => import("@/app/AppsDirectory").then(module => ({ default: module.AppsDirectory })));
const FlagshipShowcase = lazy(() => import("@/app/FlagshipShowcase"));
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
  const { actor } = useWorkspace();
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
  const completedTasks = tasks.filter(task => ["completed", "done"].includes(task.status)).length;
  const progress = tasks.length ? Math.round(100 * completedTasks / tasks.length) : null;
  const labels: Record<string,string> = {overview:"Overview",work:"Tasks & work","ai workforce":"AI workforce",approvals:"Approvals",people:"People",files:"Files",conversations:"Conversations",activity:"Activity"};
  return <div className="ws-content ws-detail-content">
    <Link className="ws-back" to={workAreaPath(slug, kind === "department" ? "spaces" : "work")}>← Back to {kind === "department" ? "Spaces" : "Work"}</Link>
    <header className="ws-detail-hero">
      <div className="ws-detail-heading"><span className="ws-eyebrow">{kind === "department" ? "DEPARTMENT WORKSPACE" : "PROJECT WORKSPACE"} / {record.status.replace(/_/g," ").toUpperCase()}</span><h1>{record.title}</h1><p>{record.summary || "A shared place for this work and the people involved."}</p><div className="ws-detail-owner"><span><CircleDot size={15}/> {record.status.replace(/_/g," ")}</span><span><Users size={15}/> {record.ownerName || "No owner assigned"}</span></div></div>
      <div className="ws-detail-create"><ContextualCreate scope={{ type: kind, id: record.id, title: record.title }} label="Create in this space"/></div>
    </header>
    <div className="ws-detail-pulse" aria-label="Workspace activity summary">
      <button type="button" onClick={() => changeTab("work")}><span><CheckCircle2 size={17}/> Linked tasks</span><strong>{tasks.length}</strong><small>{completedTasks} completed</small></button>
      <button type="button" onClick={() => changeTab("files")}><span><FileText size={17}/> Documents</span><strong>{docs.length}</strong><small>Linked to this space</small></button>
      <button type="button" onClick={() => changeTab("ai workforce")}><span><Sparkles size={17}/> AI collaborators</span><strong>{agents.length}</strong><small>Connected agents</small></button>
      <div className="ws-detail-progress"><span>Task completion</span><strong>{progress === null ? "—" : `${progress}%`}</strong><div className="ws-detail-progress-track" role="progressbar" aria-label="Linked task completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0}><span style={{width:`${progress ?? 0}%`}}/></div><small>{progress === null ? "No linked tasks yet" : `${completedTasks} of ${tasks.length} tasks complete`}</small></div>
    </div>
    <nav className="ws-detail-tabs" aria-label={record.title + " sections"}>{tabs.map(t => <button key={t} type="button" onClick={() => changeTab(t)} aria-current={tab === t ? "page" : undefined}>{labels[t]}{t === "work" && tasks.length > 0 && <span>{tasks.length}</span>}{t === "files" && docs.length > 0 && <span>{docs.length}</span>}</button>)}</nav>
    {tab === "overview" && <div className="ws-detail-overview">
      <div className="ws-detail-primary"><section className="ws-detail-panel"><div className="ws-detail-panel-head"><div><span className="ws-detail-kicker">EXECUTION</span><h2>Work in this space</h2></div><button type="button" onClick={() => changeTab("work")}>All tasks <ArrowRight size={15}/></button></div>{tasks.length ? <div className="ws-entry-list">{tasks.slice(0,5).map(task => <RowLink key={task.id} to={routeForRecord(task,slug) ?? workAreaPath(slug,"work")} title={task.title} detail={`${task.status.replace(/_/g," ")} · ${task.ownerName || "Unassigned"}`}/>)}</div> : <p className="ws-empty">No tasks linked to this space yet. Create one to start tracking progress.</p>}</section>
      {kind === "department" && <section className="ws-detail-panel"><div className="ws-detail-panel-head"><div><span className="ws-detail-kicker">PORTFOLIO</span><h2>Department projects</h2></div></div>{projects.length ? <div className="ws-entry-list">{projects.slice(0,7).map(project => <RowLink key={project.id} to={`${workAreaPath(slug, "work")}/project/${project.id}`} title={project.title} detail={project.status} icon={FolderKanban}/>)}</div> : <p className="ws-empty">No projects linked to this department yet.</p>}</section>}
      <section className="ws-detail-panel"><div className="ws-detail-panel-head"><div><span className="ws-detail-kicker">KNOWLEDGE</span><h2>Linked documents</h2></div><button type="button" onClick={() => changeTab("files")}>All files <ArrowRight size={15}/></button></div>{docs.length ? <div className="ws-entry-list">{docs.slice(0,4).map(doc => <RowLink key={doc.id} title={doc.title} detail={doc.status.replace(/_/g," ")} to={routeForRecord(doc,slug) ?? workAreaPath(slug,"spaces")}/>)}</div> : <p className="ws-empty">Files shared with this space will appear here.</p>}</section></div>
      <aside className="ws-detail-secondary"><section className="ws-detail-panel"><span className="ws-detail-kicker">SPACE DETAILS</span><h2>At a glance</h2><dl><div><dt>Status</dt><dd>{record.status.replace(/_/g," ")}</dd></div><div><dt>Responsible</dt><dd>{record.ownerName || "Unassigned"}</dd></div><div><dt>Last updated</dt><dd>{new Date(record.updatedAt).toLocaleDateString()}</dd></div><div><dt>Channels</dt><dd>{channels.length}</dd></div></dl></section>
      <section className="ws-detail-panel"><span className="ws-detail-kicker">COLLABORATION</span><h2>People & coordination</h2><div className="ws-detail-quicklinks"><button onClick={() => changeTab("people")}><Users size={16}/> People <ArrowRight size={15}/></button><button onClick={() => changeTab("conversations")}><MessageSquare size={16}/> Conversations <ArrowRight size={15}/></button><button onClick={() => changeTab("approvals")}><CheckCircle2 size={16}/> Approvals <ArrowRight size={15}/></button><button onClick={() => changeTab("activity")}><Clock3 size={16}/> Activity <ArrowRight size={15}/></button></div></section></aside>
    </div>}
    {tab === "work" && <div className="ws-stack"><DeferredPanel><WorkspaceTaskDesk tasks={tasks} slug={slug} actor={actor} kind={kind} id={record.id} title={record.title}/></DeferredPanel>{kind === "department" && <section className="ws-detail-panel"><h2>Department projects</h2>{projects.length ? <div className="ws-entry-list">{projects.map(project => <RowLink key={project.id} to={`${workAreaPath(slug,"work")}/project/${project.id}`} title={project.title} detail={project.status} icon={FolderKanban}/>)}</div> : <p className="ws-empty">No linked projects.</p>}</section>}</div>}
    {tab === "ai workforce" && <DeferredPanel><AgentWorkBoard scope={{type:kind,id:record.id}}/></DeferredPanel>}
    {tab === "approvals" && <DeferredPanel><TaskApprovalBoard scope={{type: kind, id: record.id}}/></DeferredPanel>}
    {tab === "people" && <div className="ws-stack"><DeferredPanel><CompanyPeople scope={{type:kind,id:record.id,title:record.title}}/></DeferredPanel><WorkList title="AI collaborators" records={agents} slug={slug} fallback="No AI collaborators linked." /></div>}
    {tab === "files" && <DeferredPanel><ResourceLibrary scope={{type:kind,id:record.id,title:record.title}}/></DeferredPanel>}
    {tab === "conversations" && <div className="ws-collaboration"><header className="ws-collaboration-head"><div><span className="ws-detail-kicker">COORDINATION / CONVERSATIONS</span><h2>Conversations that move work.</h2><p>Return to discussions linked to this space or open the Communications application.</p></div><Link to={appEntry("COMMS",slug)}>Open Communications <ArrowRight size={16}/></Link></header><section className="ws-detail-panel"><div className="ws-detail-panel-head"><div><span className="ws-detail-kicker">LINKED DISCUSSIONS</span><h2>Workspace channels</h2></div><span className="ws-collaboration-count">{channels.length} linked</span></div>{channels.length ? <div className="ws-entry-list">{channels.map(channel => <RowLink key={channel.id} title={channel.title} detail={channel.summary || channel.status.replace(/_/g," ")} to={routeForRecord(channel,slug) ?? appEntry("COMMS",slug)} icon={MessageSquare}/>)}</div> : <div className="ws-collaboration-empty"><MessageSquare size={23}/><strong>No linked conversations</strong><p>Discussions linked to this workspace will appear here. You can still start in Communications.</p><Link to={appEntry("COMMS",slug)}>Go to Communications <ArrowRight size={15}/></Link></div>}</section></div>}
    {tab === "activity" && <DeferredPanel><WorkspaceActivity record={record} linked={[...tasks,...docs,...projects,...channels,...agents]} slug={slug} fallback={workAreaPath(slug,kind==="department"?"spaces":"work")}/></DeferredPanel>}
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

  if (path[4] === "showcase") return <DeferredPanel><FlagshipShowcase/></DeferredPanel>;
  if (path[4] === "setup") return <DeferredPanel><CompanySetupCentre/></DeferredPanel>;
  if (path[4] === "health") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / WORKSPACE OPERATIONS</span><h1>Workspace health</h1><p>Read-only checks for your company records, applications and browser storage.</p></header><DeferredPanel><WorkspaceHealth/></DeferredPanel></div>;
  if (path[4] === "account") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / DATA & IDENTITY</span><h1>Account & data readiness</h1><p>Understand local data, export a secure handoff archive, and see what is required for cloud accounts and synchronisation.</p></header><DeferredPanel><AccountCloud/></DeferredPanel></div>;
  if (path[4] === "people") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / COLLABORATION</span><h1>People & collaboration</h1><p>Manage the company directory and prepare workspace membership and invitations without claiming to grant account access.</p></header><DeferredPanel><CompanyPeople/></DeferredPanel></div>;
  if (path[4] === "resources") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / SHARED RESOURCES</span><h1>Files & resources</h1><p>Organise company documents into folders, preview content, and connect resources to projects and departments.</p><div className="ws-page-actions"><ContextualCreate label="Create document"/></div></header><DeferredPanel><ResourceLibrary/></DeferredPanel></div>;
  if (path[4] === "recent") return <div className="ws-content"><header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / CONTINUE WORKING</span><h1>Recent and saved work</h1><p>Return to the applications and workspaces you have opened in this organisation.</p></header><DeferredPanel><WorkspaceContinuity /></DeferredPanel></div>;
  if (detailKind) return detail ? <SpaceDetail key={detail.id} record={detail} kind={detailKind} all={data} slug={org.slug}/> : <div className="ws-content"><h1>Space not found</h1><p>This space is not available in this organisation.</p><Link to={workAreaPath(org.slug,area)}>Back to {headings[area]}</Link></div>;
  return <div className="ws-content">
    {area !== "home" && area !== "work" && <header className="ws-page-head"><span className="ws-eyebrow">{org.name.toUpperCase()} / {headings[area].toUpperCase()}</span><h1>{headings[area]}</h1><p>{area === "apps" ? "Find the right tool for your work, or pick up where you left off. Each application opens in this company." : WORK_AREAS.find(item => item.id === area)?.description + ". Everything here belongs to the active organisation."}</p>{area !== "apps" && <div className="ws-page-actions"><ContextualCreate label="Create new"/></div>}</header>}
    {area === "home" && <DeferredPanel><WorkspaceHome orgName={org.name} slug={org.slug} actor={actor} tasks={tasks} projects={projects} missions={missions} docs={docs} continuity={<DeferredPanel><WorkspaceContinuity compact/></DeferredPanel>}/></DeferredPanel>}
    {area === "company" && <div className="ws-stack"><div className="ws-stat-grid"><div><small>Departments</small><strong>{departments.length}</strong></div><div><small>People records</small><strong>{members.length}</strong></div><div><small>Active missions</small><strong>{missions.filter(m=>m.status==="running").length}</strong></div></div><WorkList title="Company objectives" records={(data.objectives ?? empty).slice(0,8)} slug={org.slug} fallback="No company objectives recorded."/><div className="ws-shortcuts"><RowLink to={appEntry("HQ",org.slug)} title="Executive headquarters" icon={Building2}/><RowLink to={"/o/" + org.slug + "/workspace/setup"} title="Company Setup Centre" detail="Organization, people, applications and AI foundations" icon={LockKeyhole}/><RowLink to={appEntry("BRAIN",org.slug)} title="Company Brain" icon={Layers}/><RowLink to={appEntry("ADMIN",org.slug)} title="Company administration" icon={Users}/><RowLink to={`/o/${org.slug}/workspace/people`} title="People & collaboration" icon={Users}/><RowLink to={`/o/${org.slug}/workspace/account`} title="Account & data readiness" icon={LockKeyhole}/><RowLink to={`/o/${org.slug}/workspace/health`} title="Workspace health" icon={Activity}/></div></div>}
    {area === "spaces" && <div className="ws-stack"><section className="ws-section"><h2>Departments</h2><p className="ws-muted">Open a department's shared work, contributors, files and conversations.</p><div className="ws-entry-list">{departments.length ? departments.map(record => <RowLink key={record.id} to={`${workAreaPath(org.slug,"spaces")}/department/${record.id}`} title={record.title} detail={record.summary || record.status} icon={Megaphone}/>) : <p className="ws-empty">No departments in this organisation yet.</p>}</div></section><RowLink title="Manage departments and colleagues" to={appEntry("HQ",org.slug)} icon={Plus}/></div>}
    {area === "work" && <div className="ws-stack"><DeferredPanel><WorkspaceWork orgName={org.name} slug={org.slug} actor={actor} tasks={tasks} projects={projects} missions={missions}/></DeferredPanel><DeferredPanel><AgentWorkBoard/></DeferredPanel><DeferredPanel><TaskApprovalBoard/></DeferredPanel></div>}
    {area === "apps" && <DeferredPanel><AppsDirectory /></DeferredPanel>}
  </div>;
}
