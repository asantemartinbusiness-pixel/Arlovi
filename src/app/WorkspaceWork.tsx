import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCheck, CircleDot, FolderKanban, ListTodo, Rocket, Search, SlidersHorizontal } from "lucide-react";
import { ContextualCreate } from "@/app/ContextualCreate";
import { appEntry } from "@/app/catalog";
import { routeForRecord } from "@/platform/attention";
import type { Rec } from "@/domain/types";
import "./workspace-work.css";

type Props = { orgName: string; slug: string; actor: string; tasks: Rec[]; projects: Rec[]; missions: Rec[] };
type View = "mine" | "all" | "completed";
type Sort = "updated" | "name";
const closed = new Set(["completed", "archived", "cancelled"]);
const readable = (value: string) => value.replace(/_/g," ");
const owned = (item: Rec, actor: string) => item.ownerName === actor || item.fields.assignee === actor;
function RecordRow({ item, to, kind }: { item: Rec; to: string; kind: "task" | "mission" }) {
  return <Link to={to} className="ww-row"><span className="ww-row-icon">{kind === "task" ? <CircleDot size={18}/> : <Rocket size={18}/>}</span><span className="ww-row-copy"><strong>{item.title}</strong><small><span className={closed.has(item.status) ? "ww-state ww-state-done" : "ww-state"}>{readable(item.status)}</span>{item.ownerName && <> · {item.ownerName}</>}</small></span><ArrowUpRight size={17} aria-hidden="true"/></Link>;
}
export function WorkspaceWork({ orgName, slug, actor, tasks, projects, missions }: Props) {
  const [view, setView] = useState<View>("mine");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [projectFilter, setProjectFilter] = useState("all");
  const activeProjects = projects.filter(p => !closed.has(p.status));
  const openTasks = tasks.filter(t => !closed.has(t.status));
  const mine = openTasks.filter(t => owned(t,actor));
  const running = missions.filter(m => !closed.has(m.status));
  const visibleTasks = useMemo(() => tasks.filter(t => view === "completed" ? closed.has(t.status) : view === "mine" ? !closed.has(t.status) && owned(t,actor) : !closed.has(t.status))
    .filter(t => projectFilter === "all" || t.parentId === projectFilter || t.fields.projectId === projectFilter)
    .filter(t => `${t.title} ${t.ownerName} ${t.status}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()))
    .sort((a,b) => sort === "name" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)), [tasks,view,actor,projectFilter,query,sort]);
  return <div className="ww-page">
    <header className="ww-hero"><div><span className="ws-eyebrow">{orgName.toUpperCase()} / MY TASKS & PROJECTS</span><h1>Work, moving forward.</h1><p>One clear place to keep your commitments, projects and AI missions moving.</p></div><div className="ww-hero-action"><ContextualCreate label="Create new"/></div></header>
    <section className="ww-summary" aria-label="Work overview"><div><span>My open tasks</span><strong>{mine.length}</strong><small>Assigned to your view</small></div><div><span>Active projects</span><strong>{activeProjects.length}</strong><small>In this organisation</small></div><div><span>Open missions</span><strong>{running.length}</strong><small>Across your AI workforce</small></div></section>
    <div className="ww-layout"><section className="ww-main" aria-label="Task management"><div className="ww-panel-header"><div><span className="ww-eyebrow">PERSONAL WORK QUEUE</span><h2>Tasks & assignments</h2></div><span className="ww-count">{visibleTasks.length} shown</span></div>
      <div className="ww-toolbar"><div className="ww-tabs" role="group" aria-label="Assignment filter">{([["mine","Assigned to me"],["all","All open"],["completed","Completed"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div><label className="ww-search"><Search size={17} aria-hidden="true"/><span className="ww-visually-hidden">Find tasks</span><input type="search" placeholder="Find a task…" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="ww-filterbar"><SlidersHorizontal size={16} aria-hidden="true"/><label>Project <select aria-label="Filter by project" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="all">All projects</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}</option>)}</select></label><label>Sort <select aria-label="Sort tasks" value={sort} onChange={e=>setSort(e.target.value)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label></div>
      <div className="ww-task-list">{visibleTasks.length ? visibleTasks.map(t=><RecordRow key={t.id} item={t} kind="task" to={routeForRecord(t,slug) ?? `/o/${slug}/workspace/work`}/>) : <div className="ww-empty"><CheckCheck size={25}/><strong>No tasks match this view</strong><p>Try another filter, or create a new task in your workspace.</p><button type="button" onClick={()=>{setView("all");setQuery("");setProjectFilter("all");}}>Clear filters</button></div>}</div>
    </section><aside className="ww-aside">
      <section className="ww-aside-panel"><div className="ww-panel-header"><div><span className="ww-eyebrow">PROJECT PORTFOLIO</span><h2>Active projects</h2></div><Link to={appEntry("PROJECT",slug)} aria-label="Open Project Management"><ArrowUpRight size={18}/></Link></div><div className="ww-projects">{activeProjects.length ? activeProjects.slice(0,7).map(p=><Link key={p.id} to={`/o/${slug}/workspace/work/project/${p.id}`}><span className="ww-project-icon"><FolderKanban size={17}/></span><span><strong>{p.title}</strong><small>{readable(p.status)}{p.ownerName ? ` · ${p.ownerName}` : ""}</small></span><ArrowRight size={15}/></Link>) : <p className="ww-small-empty">No active projects yet.</p>}</div></section>
      <section className="ww-aside-panel"><div className="ww-panel-header"><div><span className="ww-eyebrow">AUTONOMOUS OPERATIONS</span><h2>Open missions</h2></div><Link to={appEntry("MISSION",slug)} aria-label="Open Mission Control"><ArrowUpRight size={18}/></Link></div><div className="ww-projects">{running.slice(0,5).map(m=><RecordRow key={m.id} item={m} kind="mission" to={routeForRecord(m,slug) ?? appEntry("MISSION",slug)}/>)}{!running.length && <p className="ww-small-empty">No open missions.</p>}</div></section>
      <div className="ww-native-links"><Link to={appEntry("PROJECT",slug)}><ListTodo size={17}/> Project Management <ArrowRight size={15}/></Link><Link to={appEntry("MISSION",slug)}><Rocket size={17}/> Mission Control <ArrowRight size={15}/></Link></div>
    </aside></div>
  </div>;
}
