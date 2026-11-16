import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Archive, ChevronRight, Clock3, File, FileText, Folder, FolderPlus, Link2, Search, Unlink2, X } from "lucide-react";
import { useCollections, useMutations, useToast, useWorkspace } from "@/platform/workspace";
import { readDoc, toPlainText } from "@/applications/docs/model";
import { routeForRecord } from "@/platform/attention";
import { appEntry } from "@/app/catalog";
import type { Rec, Snapshot } from "@/domain/types";
import "./workspace-resources.css";

type Scope = { type: "project" | "department"; id: string; title: string } | null;
type FolderRecord = Rec;
const CLOSED = new Set(["archived", "deleted"]);
export const RESOURCE_FOLDERS = "resourceFolders";
export function belongsToResourceScope(record: Rec, scope: Scope): boolean {
  if (!scope) return true;
  return scope.type === "project"
    ? record.fields.projectId === scope.id || record.parentId === scope.id
    : record.fields.departmentId === scope.id;
}
export function canMoveToFolder(document: Rec, folder: FolderRecord, orgId: string, scope: Scope): boolean {
  return document.organizationId === orgId && document.collection === "documents"
    && folder.organizationId === orgId && folder.collection === RESOURCE_FOLDERS
    && folder.status !== "archived" && belongsToResourceScope(folder, scope)
    && belongsToResourceScope(document, scope);
}
function ScopeDescription({ scope }: { scope: Scope }) {
  return <p className="rs-intro">{scope ? `Documents and folders associated with ${scope.title}.` : "Company documents and resources organised in one place."} Records are stored in this browser until cloud collaboration is configured.</p>;
}
function textPreview(record: Rec): string {
  try { return toPlainText(readDoc(record.body,record.ownerName,record.createdAt)).slice(0,3200); }
  catch { return record.summary || "No preview is available for this document."; }
}
export function ResourceLibrary({ scope = null }: { scope?: Scope }) {
  const { org } = useWorkspace();
  const mutate = useMutations("workspace-resource-library");
  const toast = useToast();
  const { documents = [], resourceFolders: folders = [], projects = [], departments = [] } = useCollections(["documents", RESOURCE_FOLDERS, "projects", "departments"]);
  const [folderId,setFolderId] = useState<string | null>(null);
  const [query,setQuery] = useState("");
  const [newFolder,setNewFolder] = useState("");
  const [creating,setCreating] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [selectedId,setSelectedId] = useState<string | null>(null);
  const [attachId,setAttachId] = useState("");
  const [showAttach,setShowAttach] = useState(false);
  const scopedFolders = folders.filter(f=>!CLOSED.has(f.status)&&belongsToResourceScope(f,scope));
  const scopedDocs = documents.filter(d=>!CLOSED.has(d.status)&&belongsToResourceScope(d,scope));
  const currentFolder = scopedFolders.find(f=>f.id===folderId);
  const activeFolderId = currentFolder?.id ?? null;
  const q = query.trim().toLocaleLowerCase();
  const visibleFolders = scopedFolders.filter(f=>
    (q ? (f.title+" "+f.summary).toLowerCase().includes(q) : (f.fields.parentFolderId || "")===(activeFolderId??"")));
  const visibleDocs = scopedDocs.filter(d=>
    (q ? (d.title+" "+d.summary).toLowerCase().includes(q) : (d.fields.resourceFolderId||"")===(activeFolderId??"")));
  const selected = scopedDocs.find(d=>d.id===selectedId);
  const selectable = scope ? documents.filter(d=>!CLOSED.has(d.status)&&!belongsToResourceScope(d,scope)) : [];
  const names = new Map<string,string>([
    ...projects.map(p=>[p.id,p.title] as [string,string]),
    ...departments.map(d=>[d.id,d.title] as [string,string]),
  ]);
  const counts = useMemo(()=>({docs:scopedDocs.length,folders:scopedFolders.length}),[scopedDocs.length,scopedFolders.length]);
  async function perform(task:()=>Promise<unknown>,success:string) {
    if(busy)return;
    setBusy(true);setError("");
    try { await task();toast(success,"Your workspace resource records have been updated."); }
    catch(e) {setError(e instanceof Error?e.message:"Unable to update this resource.");}
    finally {setBusy(false);}
  }
  async function createFolder(e:FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const title=newFolder.trim();
    if(!title || busy)return;
    await perform(async()=>{
      if(scopedFolders.some(f=>f.title.toLowerCase()===title.toLowerCase() && String(f.fields.parentFolderId||"")===(activeFolderId??""))) {
        throw new Error("A folder with this name already exists here.");
      }
      await mutate.create({collection:RESOURCE_FOLDERS,title,status:"active",summary:"Workspace resource folder",
        fields:{source:"workspace-resources",
          ...(scope?.type==="project"?{projectId:scope.id}:{}),
          ...(scope?.type==="department"?{departmentId:scope.id}:{}),
          ...(activeFolderId?{parentFolderId:activeFolderId}:{}),
        }},`Resource folder created: ${title}`);
      setNewFolder("");setCreating(false);
    },"Folder created");
  }
  function folderAncestors(): FolderRecord[] {
    const result:FolderRecord[]=[];let cursor=currentFolder;
    const seen=new Set<string>();
    while(cursor&&!seen.has(cursor.id)) {
      seen.add(cursor.id);result.unshift(cursor);
      cursor=scopedFolders.find(f=>f.id===cursor?.fields.parentFolderId);
    }
    return result;
  }
  async function patchDocument(doc:Rec,fields:Record<string,string|number|boolean>,message:string) {
    const updated=await mutate.patch(doc.id,{fields},{expectRevision:doc.revision,event:message});
    if(!updated)throw new Error("The document changed. Refresh and try again.");
  }
  async function attach() {
    if(!scope)return;
    const doc=selectable.find(d=>d.id===attachId);
    if(!doc){setError("Select an existing document.");return;}
    await perform(async()=>{
      await patchDocument(doc,{[scope.type==="project"?"projectId":"departmentId"]:scope.id},`Linked document to ${scope.title}`);
      setAttachId("");setShowAttach(false);setSelectedId(doc.id);
    },"Document linked");
  }
  async function unlink(doc:Rec) {
    if(!scope)return;
    await perform(async()=>{
      const nextFields={...doc.fields};
      delete nextFields[scope.type==="project"?"projectId":"departmentId"];
      if(scope.type==="project" && doc.parentId===scope.id)throw new Error("This document's parent is the project. Change its parent in the source application before unlinking.");
      const updated=await mutate.patch(doc.id,{fields:nextFields},{expectRevision:doc.revision,replaceFields:true,event:`Unlinked document from ${scope.title}`});
      if(!updated)throw new Error("Document changed while unlinking.");
      setSelectedId(null);
    },"Document unlinked");
  }
  async function move(doc:Rec,nextFolder:string) {
    if(nextFolder) {
      const folder=scopedFolders.find(f=>f.id===nextFolder);
      if(!folder||!canMoveToFolder(doc,folder,org.id,scope)) {setError("That folder is unavailable for this document.");return;}
    }
    await perform(()=>patchDocument(doc,{resourceFolderId:nextFolder},`Organised document in ${nextFolder?"folder":"root"}`),"Document moved");
  }
  return <section className="rs-library" aria-label={scope?`${scope.title} resources`:"Company resources"}>
    <header className="rs-head"><div><h2>Resources</h2><ScopeDescription scope={scope}/></div><div className="rs-counts"><span>{counts.folders} folders</span><span>{counts.docs} documents</span></div></header>
    <div className="rs-actions">
      <label className="rs-search"><Search size={16}/><span className="ds-sr-only">Search resources</span><input aria-label="Search resources" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find files and folders"/></label>
      <button type="button" onClick={()=>setCreating(v=>!v)}><FolderPlus size={16}/> New folder</button>
      {scope&&<button type="button" onClick={()=>setShowAttach(v=>!v)}><Link2 size={16}/> Link document</button>}
      <Link to={appEntry("DOCS",org.slug)}><FileText size={16}/> Open Docs</Link>
    </div>
    {creating&&<form className="rs-inline-form" onSubmit={e=>void createFolder(e)}><label>Folder name<input autoFocus required maxLength={100} value={newFolder} onChange={e=>setNewFolder(e.target.value)} placeholder="e.g. Contracts"/></label><button type="submit" disabled={busy||!newFolder.trim()}>Create folder</button><button type="button" onClick={()=>setCreating(false)} aria-label="Cancel folder creation"><X size={16}/></button></form>}
    {showAttach&&scope&&<div className="rs-inline-form"><label>Existing company document<select aria-label="Existing document to link" value={attachId} onChange={e=>setAttachId(e.target.value)}><option value="">Select a document</option>{selectable.map(d=><option key={d.id} value={d.id}>{d.title}</option>)}</select></label><button type="button" onClick={()=>void attach()} disabled={!attachId||busy}>Link to {scope.title}</button><button type="button" onClick={()=>setShowAttach(false)} aria-label="Close link document"><X size={16}/></button></div>}
    {error&&<p className="rs-error" role="alert">{error}</p>}
    <nav className="rs-crumbs" aria-label="Folder location"><button type="button" onClick={()=>{setFolderId(null);setQuery("");}}><Folder size={15}/> All resources</button>{folderAncestors().map(folder=><span key={folder.id}><ChevronRight size={14}/><button type="button" onClick={()=>{setFolderId(folder.id);setQuery("");}}>{folder.title}</button></span>)}</nav>
    <div className="rs-body">
      <div className="rs-list">
        {visibleFolders.map(folder=><button key={folder.id} type="button" className="rs-file-row" onClick={()=>{setFolderId(folder.id);setQuery("");setSelectedId(null);}}><Folder size={19}/><span className="rs-file-name"><strong>{folder.title}</strong><small>Folder · {folder.ownerName}</small></span><ChevronRight size={16}/></button>)}
        {visibleDocs.map(doc=><button key={doc.id} type="button" className="rs-file-row" data-selected={selectedId===doc.id?"true":undefined} onClick={()=>setSelectedId(doc.id)}><File size={19}/><span className="rs-file-name"><strong>{doc.title}</strong><small>{doc.status} · revision {doc.revision} · {new Date(doc.updatedAt).toLocaleDateString()}</small></span><ChevronRight size={16}/></button>)}
        {!visibleDocs.length&&!visibleFolders.length&&<div className="rs-empty"><Archive size={20}/><p>{query?"No resources match your search.":"There are no resources in this folder yet."}</p></div>}
      </div>
      {selected&&<aside className="rs-preview" aria-label="Document preview"><div className="rs-preview-head"><h3>{selected.title}</h3><button type="button" onClick={()=>setSelectedId(null)} aria-label="Close document preview"><X size={17}/></button></div><p className="rs-summary">{selected.summary||"Document"}</p><dl><div><dt>Owner</dt><dd>{selected.ownerName}</dd></div><div><dt>Modified</dt><dd>{new Date(selected.updatedAt).toLocaleString()}</dd></div><div><dt>Version</dt><dd>Revision {selected.revision}</dd></div><div><dt>Space</dt><dd>{String(names.get(String(selected.fields.projectId||selected.fields.departmentId))||"Company")}</dd></div></dl>
        <div className="rs-preview-text"><h4>Content preview</h4><p>{textPreview(selected)||"This document is empty."}</p></div>
        <label className="rs-move">Folder<select aria-label="Move document to folder" value={String(selected.fields.resourceFolderId||"")} onChange={e=>void move(selected,e.target.value)} disabled={busy}><option value="">Unfiled</option>{scopedFolders.map(f=><option key={f.id} value={f.id}>{f.title}</option>)}</select></label>
        <div className="rs-preview-actions">{routeForRecord(selected,org.slug)&&<Link to={routeForRecord(selected,org.slug)!}>Open in Docs</Link>}{scope&&<button type="button" onClick={()=>void unlink(selected)} disabled={busy}><Unlink2 size={15}/> Unlink from space</button>}</div>
        <details className="rs-history"><summary><Clock3 size={15}/> Version history ({selected.history.length})</summary><div>{selected.history.length?selected.history.slice(0,25).map((snapshot:Snapshot,index)=><div key={snapshot.at+"-"+index} className="rs-version"><strong>Revision {Math.max(1,selected.revision-index-1)}</strong><small>{new Date(snapshot.at).toLocaleString()}</small><p>{snapshot.summary||snapshot.title}</p></div>):<p>No previous versions recorded.</p>}</div></details>
        <p className="rs-info">Version history shows stored snapshots. Restoring older versions and secure sharing require additional safeguards.</p>
      </aside>}
    </div>
  </section>;
}
