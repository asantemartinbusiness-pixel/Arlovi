import { useState } from "react";
import { AlertCircle, ClipboardCheck, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { useCollection, useToast, useWorkspace } from "@/platform/workspace";
import { EXECUTION_REQUESTS, dismissExecutionRequest, preflightAssignment, recordExecutionRequest, type Preflight } from "@/platform/executionControl";
import "./execution-control.css";

export function ExecutionControl({ assignmentId }: { assignmentId: string }) {
  const { org, actor } = useWorkspace();
  const requests = useCollection(EXECUTION_REQUESTS).filter(r => r.fields.assignmentId === assignmentId);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const pending = requests.find(r => r.status === "blocked");
  async function execute(action: () => Promise<void>, label: string) {
    if (busy) return;
    setBusy(true); setError("");
    try { await action(); toast(label, "The local audit record was saved. No model has run.", "info"); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Operation unavailable."); }
    finally { setBusy(false); }
  }
  return <div className="ws-exec" aria-label="AI execution controls">
    <div className="ws-exec-actions">
      <button type="button" disabled={busy} onClick={() => {void execute(async()=>{setPreflight(await preflightAssignment(org.id,assignmentId));},"Execution preflight checked");}}><ShieldCheck size={15}/> Check readiness</button>
      <button type="button" disabled={busy || Boolean(pending)} onClick={() => {void execute(async()=>{setPreflight(await preflightAssignment(org.id,assignmentId)); await recordExecutionRequest(org.id,assignmentId,actor);},"Blocked execution request recorded");}}><LockKeyhole size={15}/> Record execution request</button>
      {pending && <button type="button" disabled={busy} onClick={()=>{void execute(()=>dismissExecutionRequest(org.id,pending.id,actor),"Request dismissed");}}><X size={15}/> Dismiss blocked request</button>}
    </div>
    {error && <p className="ws-exec-error" role="alert">{error}</p>}
    {pending && <p className="ws-exec-blocked" role="status"><AlertCircle size={15}/> Execution blocked; {pending.fields.gateCount} mandatory gates. No AI model was called, no funds spent.</p>}
    {preflight && <details className="ws-exec-report" open>
      <summary><ClipboardCheck size={15}/> Preflight report — {preflight.gates.length} blockers</summary>
      <ul>{preflight.gates.map(gate => <li key={gate.code}><strong>{gate.code.replace(/_/g," ")}</strong><span>{gate.detail}</span></li>)}</ul>
      <p>Estimated cost unavailable. Actual model cost £0 / $0. No execution permitted until server-side verification exists.</p>
    </details>}
  </div>;
}
