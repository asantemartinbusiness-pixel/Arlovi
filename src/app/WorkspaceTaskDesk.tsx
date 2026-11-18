import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCircle2, CircleDot, ListFilter, Search } from "lucide-react";
import { ContextualCreate } from "@/app/ContextualCreate";
import { routeForRecord } from "@/platform/attention";
import type { Rec } from "@/domain/types";
import "./workspace-task-desk.css";

type Props = { tasks: Rec[]; slug: string; actor: string; kind: "project" | "department"; id: string; title: string };
type Filter = "open" | "mine" | "completed" | "all";
const done = (status: string) => ["completed", "done", "archived", "cancelled"].includes(status);
const readable = (s: string) => s.replace(/_/g, " ");
export function WorkspaceTaskDesk({ tasks, slug, actor, kind, id, title }: Props) {
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<"recent" | "name">("recent");
  const openCount = tasks.filter(t => !done(t.status)).length;
  const mine = tasks.filter(t => t.ownerName === actor || t.fields.assignee === actor).length;
  const finished = tasks.filter(t => done(t.status)).length;
  const visible = useMemo(() => tasks.filter(t => {
    if (filter === "open" && done(t.status)) return false;
    if (filter === "completed" && !done(t.status)) return false;
    if (filter === "mine" && !(t.ownerName === actor || t.fields.assignee === actor)) return false;
    const search = query.trim().toLocaleLowerCase();
    return !search || `${t.title} ${t.summary || ""} ${t.ownerName || ""} ${t.status}`.toLocaleLowerCase().includes(search);
  }).sort((a,b) => order === "name" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)), [tasks,actor,filter,query,order]);
  return <section className="wtd" aria-label="Tasks in this space">
    <header className="wtd-heading"><div><span className="ws-detail-kicker">EXECUTION / TASKS</span><h2>Every task, one clear view.</h2><p>Work linked directly to this {kind}, with the context you need to keep moving.</p></div><ContextualCreate scope={{type:kind,id,title}} label="Create in this space"/></header>
    <div className="wtd-stats"><div><CircleDot size={17}/><span>Open</span><strong>{openCount}</strong></div><div><CheckCircle2 size={17}/><span>Completed</span><strong>{finished}</strong></div><div><ListFilter size={17}/><span>Assigned to me</span><strong>{mine}</strong></div></div>
    <div className="wtd-surface">
      <div className="wtd-controls"><div className="wtd-segments" aria-label="Task status filter">{([["open","Open"],["mine","Assigned to me"],["completed","Completed"],["all","All tasks"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}</button>)}</div><label className="wtd-search"><Search size={17}/><span className="wtd-sr-only">Search tasks</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a task…"/></label><label className="wtd-sort">Sort <select value={order} onChange={e=>setOrder(e.target.value === "name" ? "name" : "recent")}><option value="recent">Recently updated</option><option value="name">Name A–Z</option></select></label></div>
      <div className="wtd-list"><div className="wtd-list-head"><span>TASK</span><span>STATUS</span><span>RESPONSIBLE</span><span>UPDATED</span></div>{visible.length ? visible.map(task=><Link className="wtd-item" key={task.id} to={routeForRecord(task,slug) ?? `/o/${slug}/workspace/work`}><span className="wtd-title"><span className="wtd-task-icon"><CircleDot size={18}/></span><span><strong>{task.title}</strong>{task.summary && <small>{task.summary}</small>}</span></span><span className={done(task.status) ? "wtd-pill wtd-done" : "wtd-pill"}>{readable(task.status)}</span><span className="wtd-owner">{task.ownerName || "Unassigned"}</span><span className="wtd-date">{new Date(task.updatedAt).toLocaleDateString()}<ArrowUpRight size={16}/></span></Link>) : <div className="wtd-empty"><CheckCircle2 size={24}/><strong>No matching tasks</strong><p>There are no tasks for these filters. Try another view or add work to this space.</p><button type="button" onClick={()=>{setFilter("all");setQuery("");}}>Show all tasks <ArrowRight size={15}/></button></div>}</div>
    </div>
  </section>;
}
