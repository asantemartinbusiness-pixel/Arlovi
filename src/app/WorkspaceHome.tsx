import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CalendarDays, CheckCircle2, CircleDot, Clock3, Inbox, Layers3, Rocket, Bell, ShieldCheck } from "lucide-react";
import { ContextualCreate } from "@/app/ContextualCreate";
import { appEntry } from "@/app/catalog";
import { buildAttention, filterForRole, headerAttentionCounts, routeForRecord } from "@/platform/attention";
import { applyAttentionReceipts } from "@/platform/attentionReceipts";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { useUi } from "@/runtime/ui";
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
function Waiting({ label, value, detail, to, icon: Icon, tone }: { label: string; value: number; detail: string; to: string; icon: typeof CheckCircle2; tone: "decision" | "update" | "task" | "mission" }) {
  return <Link to={to} className="wh-wait" data-tone={tone} data-zero={value === 0 || undefined}>
    <span className="wh-wait-icon" aria-hidden="true"><Icon size={16}/></span>
    <span className="wh-wait-copy"><span className="wh-wait-label">{label}</span><small>{detail}</small></span>
    <strong>{value}</strong>
  </Link>;
}
/** Same feed the header badges read, so the numbers on Home can never disagree with the bell. */
function useWaitingOnYou() {
  const { org, role, actor, now } = useWorkspace();
  const receipts = useUi(state => state.attentionReceipts);
  const data = useCollections(["notifications", "invoices", "bills", "tasks", "missions", "deals", "leaveRequests", "expenses", "workflowApprovals"]);
  return useMemo(() => headerAttentionCounts(applyAttentionReceipts(filterForRole(buildAttention({
    notifications: data.notifications, invoices: data.invoices, bills: data.bills, tasks: data.tasks, missions: data.missions,
    approvals: [...data.invoices, ...data.bills, ...data.expenses, ...data.deals, ...data.leaveRequests, ...data.missions],
    workflowApprovals: data.workflowApprovals, orgSlug: org.slug, now,
  }), role), receipts, org.id, role, actor, now)), [data, org.slug, org.id, now, role, actor, receipts]);
}
export function WorkspaceHome({ orgName, slug, actor, tasks, projects, missions, docs, continuity }: Props) {
  const mine = tasks.filter(t => t.ownerName === actor || t.fields.assignee === actor);
  const pending = mine.filter(t => !closed.has(t.status));
  const activeProjects = projects.filter(p => !closed.has(p.status));
  const openMissions = missions.filter(m => !closed.has(m.status));
  const recentDocs = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 3);
  const focused = [...pending].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  const { decisions, unreadUpdates } = useWaitingOnYou();
  const inbox = appEntry("INBOX", slug);
  return <div className="wh-home">
    <header className="wh-head">
      <div className="wh-head-copy">
        <span className="ws-eyebrow">{orgName.toUpperCase()} / MY WORKSPACE</span>
        <h1>Make room for <em>what matters.</em></h1>
      </div>
      <div className="wh-hero-actions"><ContextualCreate label="Create new"/><Link className="wh-secondary-action" to={inbox}>Open inbox <ArrowUpRight size={16}/></Link></div>
    </header>
    <section className="wh-waiting" aria-label="Waiting on you">
      <Waiting tone="decision" label="Decisions waiting" value={decisions} detail={decisions ? "Approvals need your answer" : "Nothing needs your approval"} to={inbox} icon={ShieldCheck}/>
      <Waiting tone="update" label="Unread updates" value={unreadUpdates} detail={unreadUpdates ? "New activity since you looked" : "You are up to date"} to={inbox} icon={Bell}/>
      <Waiting tone="task" label="Assigned to me" value={pending.length} detail={pending.length ? "Open tasks on your list" : "No open tasks"} to={`/o/${slug}/workspace/work`} icon={CheckCircle2}/>
      <Waiting tone="mission" label="Open missions" value={openMissions.length} detail={`${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"}`} to={appEntry("MISSION",slug)} icon={Rocket}/>
    </section>
    <div className="wh-main-grid">
      <section className="wh-panel wh-priority" aria-label="Assigned work">
        <div className="wh-panel-heading"><div><h2>Work to pick up</h2></div><Link to={`/o/${slug}/workspace/work`} aria-label="View all work">View all <ArrowRight size={15}/></Link></div>
        <div className="wh-work-list">{focused.length ? focused.map(t => <WorkItem key={t.id} record={t} slug={slug}/>) : <div className="wh-list-empty"><CheckCircle2 size={24}/><strong>Nothing waiting on you</strong><span>Assigned work will appear here. <Link to={`/o/${slug}/workspace/work`}>Explore work</Link></span></div>}</div>
      </section>
      <aside className="wh-side-column">
        <section className="wh-panel wh-resume" aria-label="Continue where you left off">{continuity}</section>
        <section className="wh-panel wh-quick" aria-label="Quick access"><div className="wh-panel-heading"><div><h2>Go to</h2></div></div>
          <div className="wh-quick-grid">
            <Link to={inbox}><Inbox size={18}/><span>Inbox</span><ArrowUpRight size={15}/></Link>
            <Link to={appEntry("BOOK",slug)}><CalendarDays size={18}/><span>Calendar</span><ArrowUpRight size={15}/></Link>
            <Link to={`/o/${slug}/workspace/spaces`}><Layers3 size={18}/><span>Spaces</span><ArrowUpRight size={15}/></Link>
            <Link to={`/o/${slug}/workspace/recent`}><Clock3 size={18}/><span>Recent work</span><ArrowUpRight size={15}/></Link>
          </div>
        </section>
      </aside>
    </div>
    {recentDocs.length > 0 && <section className="wh-panel wh-documents" aria-label="Recently updated documents">
      <div className="wh-panel-heading"><div><h2>Recently updated documents</h2></div><Link to={`/o/${slug}/workspace/resources`}>All resources <ArrowRight size={15}/></Link></div>
      <div className="wh-doc-grid">{recentDocs.map(doc=><WorkItem key={doc.id} record={doc} slug={slug}/>)}</div>
    </section>}
  </div>;
}
