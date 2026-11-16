import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Database, Download, FileCheck2, HardDrive, LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { useWorkspace } from "@/platform/workspace";
import { createCompanyArchive, localCompanyInventory, saveArchiveFile, type LocalCompanyInventory } from "@/platform/companyArchive";
import "./account-cloud.css";

/**
 * Account/cloud migration readiness. Does not impersonate a login or grant
 * permissions. Local-first data remains authoritative until a dedicated
 * server with verified identity, migrations and policies exists.
 */
export function AccountCloud() {
  const { org, role } = useWorkspace();
  const [inventory, setInventory] = useState<LocalCompanyInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [backupAt, setBackupAt] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  async function refresh() {
    setLoading(true);setError("");
    try { setInventory(await localCompanyInventory(org.id)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to inspect this company's local data."); }
    finally { setLoading(false); }
  }
  useEffect(() => {void refresh();},[org.id]);
  const browserConfigPresent = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  async function exportArchive() {
    if (busy || !confirmed) return;
    setBusy(true);setError("");
    try {
      const archive = await createCompanyArchive({id:org.id,slug:org.slug,name:org.name});
      saveArchiveFile(org.slug,archive);
      setBackupAt(archive.payload.generatedAt);
    } catch(caught) {setError(caught instanceof Error ? caught.message : "Could not generate the archive.");}
    finally {setBusy(false);}
  }
  return <div className="ac-page" aria-label="Account and data readiness">
    <div className="ac-summary">
      <div className="ac-icon"><CloudOff size={22}/></div>
      <div><h2>Local workspace — cloud not connected</h2><p>Your current workspace is stored in this browser. This page helps you inspect and export company data before cloud onboarding. It does not create an account or synchronise data.</p></div>
    </div>
    <div className="ac-grid">
      <section className="ac-panel"><div className="ac-panel-title"><Database size={19}/><h3>Company data</h3><button type="button" aria-label="Refresh data inventory" onClick={()=>void refresh()} disabled={loading}><RefreshCw size={16}/></button></div>
        {loading?<p className="ac-muted">Inspecting browser records…</p>:inventory?<><div className="ac-metrics"><div><strong>{inventory.recordCount}</strong><small>Records</small></div><div><strong>{inventory.auditCount}</strong><small>Audit events</small></div><div><strong>{inventory.collections.length}</strong><small>Collections</small></div></div>
          <p className="ac-muted">Last local record update: {inventory.lastModified ? new Date(inventory.lastModified).toLocaleString() : "No records yet"}</p>
          <details className="ac-details"><summary>View collection inventory</summary><div>{inventory.collections.map(c=><div key={c.name}><span>{c.name}</span><strong>{c.count}</strong></div>)}</div></details>
          {inventory.unlinkedParentIds.length>0&&<p className="ac-warning"><AlertTriangle size={16}/> {inventory.unlinkedParentIds.length} parent reference(s) do not resolve within this company. Review these before any migration.</p>}
        </>:<p className="ac-muted">No inventory available.</p>}
      </section>
      <section className="ac-panel"><div className="ac-panel-title"><LockKeyhole size={19}/><h3>Account & access</h3></div>
        <div className="ac-status"><span>Authenticated cloud identity</span><strong>Not configured</strong></div>
        <div className="ac-status"><span>Cloud organisation membership</span><strong>Not configured</strong></div>
        <div className="ac-status"><span>Server-enforced roles</span><strong>Not configured</strong></div>
        <div className="ac-status"><span>Current local role view</span><strong>{role}</strong></div>
        <div className="ac-status"><span>Public client configuration</span><strong>{browserConfigPresent?"Present — unverified":"Not provided"}</strong></div>
        <p className="ac-muted">Selecting a role in this browser is not authentication. Real account creation and invitation acceptance will only be enabled after a dedicated backend and row-level access policies pass verification.</p>
      </section>
    </div>
    <section className="ac-panel ac-backup"><div className="ac-panel-title"><HardDrive size={19}/><h3>Export a portable company archive</h3></div>
      <p>The archive includes this organisation's records, document content stored in records, and local audit events. It contains sensitive business information and is **not encrypted**. Save it only somewhere you trust.</p>
      <div className="ac-safe"><FileCheck2 size={18}/><div><strong>SHA-256 integrity checksum</strong><span>Included alongside the original records to detect accidental changes during a later import. Export does not alter, delete or upload any existing data.</span></div></div>
      <label className="ac-confirm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I understand this backup may include confidential company information and must be stored securely.</span></label>
      <button type="button" className="ac-export" onClick={()=>void exportArchive()} disabled={!confirmed||busy||loading}><Download size={17}/>{busy?"Preparing archive…":"Download company archive"}</button>
      {backupAt&&<p className="ac-success" role="status"><CheckCircle2 size={16}/> Archive prepared at {new Date(backupAt).toLocaleString()}. Check your browser downloads.</p>}
      <p className="ac-muted">This is an export only. Import and restore remain disabled until data ownership, identity mapping and conflict review are verified.</p>
    </section>
    <section className="ac-panel"><div className="ac-panel-title"><ShieldCheck size={19}/><h3>Cloud activation requirements</h3></div>
      <div className="ac-requirements">
        <div><span>01</span><p><strong>Dedicated Arlovi database</strong>— not an existing Hilis project</p></div>
        <div><span>02</span><p><strong>Verified email identity</strong> and authenticated sessions</p></div>
        <div><span>03</span><p><strong>Tenant-scoped membership permissions</strong> enforced by the server and database</p></div>
        <div><span>04</span><p><strong>Reviewable migration</strong> from local IDs to cloud IDs, with explicit consent</p></div>
        <div><span>05</span><p><strong>Conflict handling and recovery</strong> tested across browsers, devices and users</p></div>
      </div>
      <p className="ac-muted">The backend schema is staged in the repository for review. It has not been installed in a live database. AI provider integration remains separate and deferred.</p>
    </section>
    {error&&<p className="ac-error" role="alert">{error}</p>}
  </div>;
}
