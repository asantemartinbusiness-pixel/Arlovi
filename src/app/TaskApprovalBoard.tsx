import { useState } from "react";
import { CheckCircle2, Clock3, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { useCollection, useToast, useWorkspace } from "@/platform/workspace";
import { decideTaskApproval, requestTaskCompletion, withdrawTaskApproval } from "@/platform/taskApprovals";
import type { Rec } from "@/domain/types";
import { routeForRecord } from "@/platform/attention";
import { Link } from "react-router-dom";
import "./task-approvals.css";

type Scope = { type: "project" | "department"; id: string } | null;
function belongs(record: Rec, scope: Scope): boolean {
  if (!scope) return true;
  return scope.type === "project"
    ? record.parentId === scope.id || record.fields.projectId === scope.id
    : record.fields.departmentId === scope.id;
}

/**
 * One explicit human-review surface shared across project and department
 * spaces. No agent or external action runs automatically.
 */
export function TaskApprovalBoard({ scope = null }: { scope?: Scope }) {
  const { org, actor, role } = useWorkspace();
  const tasks = useCollection("tasks");
  const requests = useCollection("workflowApprovals");
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const relevantTasks = tasks.filter(t => belongs(t, scope));
  const allRequests = requests.filter(r => scope
    ? r.fields[scope.type === "project" ? "projectId" : "departmentId"] === scope.id ||
      relevantTasks.some(t => t.id === r.fields.taskId)
    : true);
  const pending = allRequests.filter(r => r.status === "awaiting_approval");
  const history = [...allRequests].filter(r => r.status !== "awaiting_approval")
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,5);

  const reviewable = relevantTasks.filter(task => !["completed","cancelled","archived"].includes(task.status));
  const [showHistory,setShowHistory] = useState(false);
  async function submit(task: Rec) {
    setBusyId(task.id);setError("");
    try { await requestTaskCompletion(org.id,task.id,actor);toast("Review requested",`Completion of ${task.title} is awaiting a decision.`,"info"); }
    catch (e) { setError(e instanceof Error?e.message:"Unable to request review."); }
    finally { setBusyId(null); }
  }
  async function decide(request: Rec, decision: "approved"|"rejected") {
    setBusyId(request.id);setError("");
    try { await decideTaskApproval(org.id,request.id,actor,decision);toast(decision==="approved"?"Completion approved":"Completion declined",request.title); }
    catch (e) {setError(e instanceof Error?e.message:"Unable to resolve approval.");}
    finally {setBusyId(null);}
  }
  async function withdraw(request: Rec) {
    setBusyId(request.id); setError("");
    try { await withdrawTaskApproval(org.id,request.id,actor);toast("Request withdrawn", "You can request a fresh review when ready.", "info"); }
    catch (e) {setError(e instanceof Error ? e.message : "Unable to withdraw review.");}
    finally {setBusyId(null);}
  }
  return <section className="ws-section ws-approvals" aria-label="Task completion approvals">
    <div className="ws-approval-intro"><div><span className="ws-approval-eyebrow">GOVERNANCE / HUMAN DECISIONS</span><h2>Approvals & decisions</h2><p>Review completion requests, make explicit decisions and keep a clear local audit trail.</p></div><ShieldCheck size={25} aria-hidden="true"/></div>
    <div className="ws-approval-overview" aria-label="Approval overview"><div><span>Awaiting review</span><strong>{pending.length}</strong><small>Needs a decision</small></div><div><span>Eligible tasks</span><strong>{reviewable.length}</strong><small>Available for review</small></div><div><span>Recorded decisions</span><strong>{allRequests.filter(r=>r.status==="approved"||r.status==="rejected").length}</strong><small>In this workspace</small></div></div>
    {pending.length===0 && <div className="ws-approval-empty"><CheckCircle2 size={19}/><div><strong>No approvals awaiting review</strong><p>Completion requests will appear here for an explicit decision.</p></div></div>}
    {error && <p role="alert" className="ws-approval-error">{error}</p>}
    {pending.length>0 && <div className="ws-approval-block">
      <h3><Clock3 size={15}/> Awaiting review ({pending.length})</h3>
      {pending.map(request => {
        const task=relevantTasks.find(t=>t.id===request.fields.taskId) ?? tasks.find(t=>t.id===request.fields.taskId);
        const stale=!task || task.revision!==Number(request.fields.taskRevision);
        return <div className="ws-approval-row" key={request.id}>
          <div className="ws-approval-label"><strong>{task?.title??request.title}</strong><small>Requested by {request.fields.requestedBy} · {stale?"Task changed since request":"Ready for review"}</small></div>
          {role==="owner" ? <div className="ws-approval-actions">
            <button type="button" disabled={Boolean(busyId)||stale} onClick={()=>{void decide(request,"approved");}}><CheckCircle2 size={15}/> Approve</button>
            <button type="button" disabled={Boolean(busyId)||stale} onClick={()=>{void decide(request,"rejected");}}><XCircle size={15}/> Decline</button>
            <button type="button" disabled={Boolean(busyId)} onClick={()=>{void withdraw(request);}}>Withdraw</button>
          </div> : <span className="ws-approval-muted">Awaiting owner review</span>}
        </div>;
      })}
    </div>}
    {reviewable.length>0 && <div className="ws-approval-block">
      <h3>Tasks</h3>
      {reviewable.slice(0,20).map(task => {
        const requested=pending.some(r=>r.fields.taskId===task.id);
        return <div className="ws-approval-row" key={task.id}>
          <div className="ws-approval-label"><strong>{task.title}</strong><small>{task.status.replace(/_/g," ")} · {task.ownerName}</small></div>
          <div className="ws-approval-actions">
            {routeForRecord(task,org.slug) && <Link to={routeForRecord(task,org.slug)!}>Open task</Link>}
            <button type="button" disabled={Boolean(busyId)||requested} onClick={()=>{void submit(task);}}>{requested?"Review pending":"Request completion"}</button>
          </div>
        </div>;
      })}
    </div>}
    {pending.length===0 && relevantTasks.length===0 && <p className="ws-empty">No tasks or pending completion reviews in this space.</p>}
    {history.length>0 && <div className="ws-approval-block">
      <button type="button" className="ws-approval-history-toggle" aria-expanded={showHistory} onClick={()=>setShowHistory(v=>!v)}><RotateCcw size={15}/> Recent decisions ({history.length}) <span>{showHistory?"Hide":"Show"}</span></button>
      {showHistory && <div>{history.map(request=><div className="ws-approval-row" key={request.id}><div className="ws-approval-label"><strong>{request.title}</strong><small>{request.status} · {request.fields.decidedBy??"Reviewer"} · {new Date(request.updatedAt).toLocaleDateString()}</small></div></div>)}</div>}
    </div>}
    <p className="ws-approval-muted">Local workflow demonstration: reviewer role selection is not server-enforced identity or authorisation.</p>
  </section>;
}
