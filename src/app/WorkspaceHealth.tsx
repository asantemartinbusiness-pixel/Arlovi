import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Database, ExternalLink, HardDrive, RefreshCw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { useOrgRecords, useWorkspace } from "@/platform/workspace";
import { applicationLoadFailures } from "@/applications";
import { localCompanyInventory, type LocalCompanyInventory } from "@/platform/companyArchive";
import "./workspace-health.css";

type Issue = { key: string; name: string; detail: string };
/** Non-destructive diagnostics. There are no automatic repairs or destructive resets. */
export function WorkspaceHealth() {
  const { org } = useWorkspace();
  const records = useOrgRecords();
  const [inventory, setInventory] = useState<LocalCompanyInventory | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [storage, setStorage] = useState<{ used: number; quota: number } | null>(null);

  async function refresh() {
    setRefreshing(true); setError("");
    try {
      setInventory(await localCompanyInventory(org.id));
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        setStorage(typeof estimate.usage === "number" && typeof estimate.quota === "number"
          ? { used: estimate.usage, quota: estimate.quota } : null);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to inspect local workspace health.");
    } finally { setRefreshing(false); }
  }

  useEffect(() => {
    void refresh();
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online",up); window.addEventListener("offline",down);
    return () => { window.removeEventListener("online",up); window.removeEventListener("offline",down); };
  },[org.id]);

  const issues = useMemo<Issue[]>(() => {
    const ids = new Set(records.map(row => row.id));
    const list: Issue[] = [];
    // Do not flag legitimately external references, only parentId which is a
    // canonical same-organisation record pointer.
    for(const row of records) {
      if(row.parentId && !ids.has(row.parentId)) {
        list.push({ key: `parent-${row.id}`, name: "Unresolved parent reference",
          detail: `${row.collection}: ${row.title || row.id}` });
      }
      if(!Number.isInteger(row.revision) || row.revision < 1) {
        list.push({ key: `revision-${row.id}`, name: "Invalid record revision",
          detail: `${row.collection}: ${row.title || row.id}` });
      }
      if(!row.title.trim()) {
        list.push({ key: `title-${row.id}`, name: "Record missing a title",
          detail: `${row.collection}: ${row.id}` });
      }
    }
    return list.slice(0,100);
  },[records]);
  const failed = applicationLoadFailures();
  const size = (n: number) => n >= 1024 * 1024 ? `${(n / (1024*1024)).toFixed(1)} MB` : `${Math.round(n/1024)} KB`;
  return <div className="wh-page" aria-label="Workspace health">
    <div className="wh-intro"><div><h2>Workspace diagnostics</h2><p>Inspect your local data, application loading and browser storage. Checks here are read-only; no company records will be changed.</p></div>
      <button type="button" onClick={() => void refresh()} disabled={refreshing}><RefreshCw size={16}/>{refreshing?"Checking…":"Run checks"}</button>
    </div>
    <div className="wh-stat-grid">
      <div><Database size={18}/><strong>{inventory?.recordCount ?? "—"}</strong><span>Company records</span></div>
      <div><ShieldCheck size={18}/><strong>{inventory?.auditCount ?? "—"}</strong><span>Local audit events</span></div>
      <div><HardDrive size={18}/><strong>{storage ? size(storage.used) : "Unavailable"}</strong><span>Browser storage used (all origins' local data)</span></div>
      <div>{online?<Wifi size={18}/>:<WifiOff size={18}/>}<strong>{online?"Online":"Offline"}</strong><span>Browser network status</span></div>
    </div>
    {error&&<p className="wh-error" role="alert">{error}</p>}
    <section className="wh-panel">
      <h3>Data integrity <span>{issues.length ? `${issues.length} findings` : "No local reference issues found"}</span></h3>
      {issues.length ? <div className="wh-findings">{issues.map(issue=><div key={issue.key} className="wh-finding"><AlertTriangle size={17}/><div><strong>{issue.name}</strong><p>{issue.detail}</p></div></div>)}</div>
        : <div className="wh-good"><CheckCircle2 size={19}/><p>No missing parent IDs, invalid revisions or blank titles detected among the loaded company records.</p></div>}
      <p className="wh-footnote">These checks are limited to local record shape and parent relationships. They do not verify every native application's business rules.</p>
    </section>
    <section className="wh-panel">
      <h3>Application loading <span>{failed.length ? `${failed.length} failures` : "No module failures reported"}</span></h3>
      {failed.length ? <div className="wh-findings">{failed.map(f=><div className="wh-finding" key={f.group}><AlertTriangle size={17}/><div><strong>{f.group}</strong><p>{f.message}</p></div></div>)}</div>
        : <div className="wh-good"><CheckCircle2 size={19}/><p>All currently registered application groups loaded during this browser session.</p></div>}
    </section>
    <section className="wh-panel">
      <h3>Data protection and recovery</h3>
      <p>Arlovi is still browser-local. Browser storage can be lost when site data is cleared, and this screen cannot recover deleted data. Export an independent copy of company records before changing devices or clearing your browser.</p>
      <Link to={`/o/${org.slug}/workspace/account`} className="wh-link"><ExternalLink size={16}/> Go to account & company archive</Link>
      <p className="wh-footnote">Cloud identity, server-enforced multi-user permissions and cross-device synchronisation are not connected.</p>
    </section>
  </div>;
}
