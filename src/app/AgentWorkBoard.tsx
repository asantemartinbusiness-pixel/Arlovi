import { useState } from "react";
import { Bot, ClipboardList, FileSearch, Link2Off, PauseCircle, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useCollection, useToast, useWorkspace } from "@/platform/workspace";
import { routeForRecord } from "@/platform/attention";
import { AGENT_ASSIGNMENTS, AGENT_RECEIPTS, AgentWorkError, assignAgentToTask, cancelAgentAssignment, prepareAgentBrief } from "@/platform/agentWork";
import { capabilityById } from "@/platform/capability";
import type { Rec } from "@/domain/types";
import "./agent-work-board.css";

type Scope = { type: "project" | "department"; id: string } | null;
function inScope(record: Rec, scope: Scope) {
  if (!scope) return true;
  return scope.type === "project" ? record.parentId === scope.id || record.fields.projectId === scope.id
    : record.fields.departmentId === scope.id;
}

export function AgentWorkBoard({ scope = null }: { scope?: Scope }) {
  const { org, actor } = useWorkspace();
  const tasks = useCollection("tasks");
  const agents = useCollection("agents");
  const assignments = useCollection(AGENT_ASSIGNMENTS);
  const receipts = useCollection(AGENT_RECEIPTS);
  const toast = useToast();
  const [taskId, setTaskId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const relevantTasks = tasks.filter(t => inScope(t, scope));
  const selectableTasks = relevantTasks.filter(t => !["completed", "cancelled", "archived"].includes(t.status));
  const activeAgents = agents.filter(agent => agent.status === "active");
  const relevantAssignments = assignments.filter(assignment =>
    relevantTasks.some(task => task.id === assignment.fields.taskId));
  const pending = relevantAssignments.filter(a => a.status === "awaiting_provider");
  const recent = [...relevantAssignments].filter(a => a.status !== "awaiting_provider")
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,8);
  const model = capabilityById("model.inference");
  async function perform(action: () => Promise<unknown>, message: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); toast(message, "The workspace record and audit trail were saved.", "info"); }
    catch (caught) { setError(caught instanceof AgentWorkError || caught instanceof Error ? caught.message : "The action could not be saved."); }
    finally { setBusy(false); }
  }
  const readyToAssign = Boolean(taskId && agentId) && !pending.some(a => a.fields.taskId === taskId);
  return <section className="ws-section ws-agent-work" aria-label="AI work assignments">
    <div className="ws-agent-heading"><div><h2>AI work assignments</h2><p>Assign work to an AI employee contract and prepare a reviewable source brief. Provider execution is not configured.</p></div><Bot size={23} aria-hidden="true"/></div>
    <div className="ws-agent-capability" role="status"><PauseCircle size={18}/><div><strong>Execution unavailable</strong><span>{model?.note ?? "No language model is connected."} Assignments remain pending, not running.</span></div></div>
    {error && <p role="alert" className="ws-agent-error">{error}</p>}
    <div className="ws-agent-form">
      <label>Task<select value={taskId} onChange={e => setTaskId(e.target.value)} aria-label="Task to assign">
        <option value="">Select a task</option>
        {selectableTasks.map(task=><option key={task.id} value={task.id}>{task.title}</option>)}
      </select></label>
      <label>AI employee<select value={agentId} onChange={e => setAgentId(e.target.value)} aria-label="AI employee">
        <option value="">Select an AI employee</option>
        {activeAgents.map(agent=><option key={agent.id} value={agent.id}>{agent.title}</option>)}
      </select></label>
      <button type="button" disabled={!readyToAssign || busy} onClick={() => {void perform(() => assignAgentToTask(org.id, taskId, agentId, actor), "Assignment recorded — awaiting provider");}}>Assign work</button>
    </div>
    {activeAgents.length === 0 && <p className="ws-agent-note"><ShieldAlert size={16}/> No active AI employee contracts in this company. Configure an employee in the <Link to={`/o/${org.slug}/team/agents`}>AI Workforce</Link> application.</p>}
    {selectableTasks.length === 0 && <p className="ws-empty">No open tasks in this working space. Create a task first.</p>}
    {pending.length > 0 && <div className="ws-agent-list"><h3>Awaiting provider ({pending.length})</h3>{pending.map(assignment => {
      const task=tasks.find(t=>t.id===assignment.fields.taskId);
      const related=receipts.filter(r=>r.fields.assignmentId===assignment.id)
        .sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
      return <div className="ws-agent-row" key={assignment.id}>
        <div className="ws-agent-details"><strong>{task?.title ?? assignment.title}</strong>
          <small>Assigned to {assignment.fields.agentName} · Not executing</small>
          {related.length>0 && <div className="ws-agent-receipts">{related.slice(0,3).map(receipt=><details key={receipt.id}><summary><FileSearch size={14}/> {receipt.title}</summary><p>{receipt.summary}</p><ul>{((receipt.body as { documents?: {id:string;title:string}[] } | undefined)?.documents ?? []).map(doc=><li key={doc.id}>{doc.title}</li>)}</ul></details>)}</div>}
        </div>
        <div className="ws-agent-actions">
          {task && routeForRecord(task,org.slug) && <Link to={routeForRecord(task,org.slug)!}>Open task</Link>}
          <button type="button" disabled={busy} onClick={() => {void perform(() => prepareAgentBrief(org.id,assignment.id,actor),"Source brief prepared — no model called");}}><ClipboardList size={15}/> Prepare brief</button>
          <button type="button" disabled={busy} onClick={() => {void perform(() => cancelAgentAssignment(org.id,assignment.id,actor),"Assignment cancelled");}}><Link2Off size={15}/> Cancel</button>
        </div>
      </div>;
    })}</div>}
    {recent.length>0 && <div className="ws-agent-list"><h3>Previous assignments</h3>{recent.map(assignment=><div key={assignment.id} className="ws-agent-row"><div className="ws-agent-details"><strong>{assignment.title}</strong><small>{assignment.status} · {new Date(assignment.updatedAt).toLocaleDateString()}</small></div></div>)}</div>}
    <p className="ws-agent-note"><ShieldAlert size={16}/> This is a browser-local assignment and evidence workflow. It does not perform AI inference, schedule background work, incur model charges, or enforce server-side workforce permissions.</p>
  </section>;
}
