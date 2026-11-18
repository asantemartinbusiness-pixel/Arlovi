import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, CircleDot, Clock3, FolderKanban, Inbox, Layers3, Rocket, Sparkles } from "lucide-react";
import { ContextualCreate } from "@/app/ContextualCreate";
import { appEntry } from "@/app/catalog";
import { routeForRecord } from "@/platform/attention";
import type { Rec } from "@/domain/types";
import type { ReactNode } from "react";
import "./workspace-home.css";

type Props = { orgName: string; slug: string; actor: string; tasks: Rec[]; projects: Rec[]; missions: Rec[]; docs: Rec[]; continuity: ReactNode };
const closed = new Set(["completed", "archived", "cancelled"]);
const labelStatus = (status: string) => status.replace(/_/g, " ");
const itemPath = (record: Rec, slug: string) => routeForRecord(record, slug) ?? `/o/${slug}/workspace/work`;
function WorkItem({ record, slug }: { record: Rec; slug: string }) {
  return <Link className="wh-work-item" to={itemPath(record, slug)}>
    <span className="wh-work-status" aria-hidden="true"><CircleDot size={17}/></span>
    <span className="wh-work-copy"><strong>{record.title}</strong><small>{labelStatus(record.status)}{record.ownerName ? ` · ${record.ownerName}` : ""}</small></span>
    <ArrowUpRight size={17} aria-hidden="true"/>
  </Link>;
}
function Metric({ label, value, detail, to, icon: Icon }: { label: string; value: number; detail: string; to: string; icon: typeof CheckCircle2 }) {
  return <Link to={to} className="wh-metric">
    <span className="wh-metric-top"><span>{label}</span><Icon size={18} aria-hidden="true"/></span>
    <strong>{value}</strong><span className="wh-metric-bottom">{detail}<ArrowUpRight size={15} aria-hidden="true"/></span>
  </Link>;
}
export function WorkspaceHome({ orgName, slug, actor, tasks, projects, missions, docs, continuity }: Props) {
  const mine = tasks.filter(t => t.ownerName === actor || t.fields.assignee === actor);
  const pending = mine.filter(t => !closed.has(t.status));
  const activeProjects = projects.filter(p => !closed.has(p.status));
  const openMissions = missions.filter(m => !closed.has(m.status));
  const recentDocs = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const focused = [...pending].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  return <div className="wh-home">
    <header className="wh-hero">
      <div className="wh-hero-copy">
        <span className="ws-eyebrow">{orgName.toUpperCase()} / MY WORKSPACE</span>
        <div className="wh-hero-kicker"><span className="wh-live-dot" aria-hidden="true"/> YOUR WORK, IN FOCUS</div>
        <h1>Make room for <em>what matters.</em></h1>
        <p>Pick up your work, see what needs attention and move between your tools without losing context.</p>
        <div className="wh-hero-actions"><ContextualCreate label="Create new"/><Link className="wh-secondary-action" to={appEntry("INBOX",slug)}>Open inbox <ArrowUpRight size={16}/></Link></div>
      </div>
      <div className="wh-focus-card">
        <span className="wh-focus-label"><Sparkles size={15}/> YOUR NEXT MOVE</span>
        <strong>{pending.length ? `${pending.length} task${pending.length === 1 ? "" : "s"} on your list` : "You're all caught up"}</strong>
        <p>{pending.length ? "Open your assigned work and choose where to focus next." : "No open tasks are assigned to you. Explore your projects or create something new."}</p>
        <Link to={`/o/${slug}/workspace/work`}>{pending.length ? "Review assigned work" : "Explore work"} <ArrowRight size={16}/></Link>
      </div>
    </header>
    <section className="wh-overview" aria-label="Your work at a glance">
      <div className="wh-section-heading"><div><span className="wh-section-kicker">AT A GLANCE</span><h2>Everything moving forward</h2></div><span className="wh-section-note">From your active organisation</span></div>
      <div className="wh-metrics">
        <Metric label="Assigned to me" value={pending.length} detail="Open assigned tasks" to={`/o/${slug}/workspace/work`} icon={CheckCircle2}/>
        <Metric label="Active projects" value={activeProjects.length} detail="Explore your projects" to={`/o/${slug}/workspace/work`} icon={FolderKanban}/>
        <Metric label="Open missions" value={openMissions.length} detail="Go to Mission Control" to={appEntry("MISSION",slug)} icon={Rocket}/>
      </div>
    </section>
    <div className="wh-main-grid">
      <section className="wh-panel wh-priority" aria-label="Assigned work">
        <div className="wh-panel-heading"><div><span className="wh-section-kicker">YOUR PRIORITIES</span><h2>Work to pick up</h2><p>Your open assignments across Arlovi.</p></div><Link to={`/o/${slug}/workspace/work`} aria-label="View all work">View all <ArrowRight size={15}/></Link></div>
        <div className="wh-work-list">{focused.length ? focused.map(t => <WorkItem key={t.id} record={t} slug={slug}/>) : <div className="wh-list-empty"><CheckCircle2 size={24}/><strong>Nothing waiting on you</strong><span>New assigned work will appear here.</span></div>}</div>
      </section>
      <aside className="wh-side-column">
        <section className="wh-panel wh-resume" aria-label="Continue where you left off">{continuity}</section>
        <section className="wh-panel wh-quick" aria-label="Quick access"><div className="wh-panel-heading"><div><span className="wh-section-kicker">YOUR SHORTCUTS</span><h2>Jump right in</h2></div></div>
          <div className="wh-quick-grid">
            <Link to={appEntry("INBOX",slug)}><Inbox size={18}/><span>Inbox</span><ArrowUpRight size={15}/></Link>
            <Link to={appEntry("BOOK",slug)}><CalendarDays size={18}/><span>Calendar</span><ArrowUpRight size={15}/></Link>
            <Link to={`/o/${slug}/workspace/spaces`}><Layers3 size={18}/><span>Spaces</span><ArrowUpRight size={15}/></Link>
            <Link to={`/o/${slug}/workspace/recent`}><Clock3 size={18}/><span>Recent work</span><ArrowUpRight size={15}/></Link>
          </div>
        </section>
      </aside>
    </div>
    <section className="wh-panel wh-documents" aria-label="Recently updated documents">
      <div className="wh-panel-heading"><div><span className="wh-section-kicker">STAY CONNECTED</span><h2>Recently updated documents</h2></div><Link to={`/o/${slug}/workspace/resources`}>All resources <ArrowRight size={15}/></Link></div>
      <div className="wh-doc-grid">{recentDocs.length ? recentDocs.map(doc=><WorkItem key={doc.id} record={doc} slug={slug}/>) : <p className="wh-doc-empty">Documents you and your team update will appear here.</p>}</div>
    </section>
  </div>;
}
