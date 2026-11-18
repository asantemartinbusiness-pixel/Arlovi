import { useEffect, useMemo, useState } from "react";
import { CheckCheck, Eye, FilePenLine, LockKeyhole, RotateCcw, Save, ShieldAlert } from "lucide-react";
import { applications, screens } from "@/app/catalog";
import { NAV_GROUPS } from "@/app/nav";
import { useCollectionState } from "@/platform/workspace";
import { can } from "@/platform/policy";
import { ROLE_TEMPLATES, roleTemplate, type AccessScope } from "@/platform/accessModel";
import {
  MATRIX_ACTIONS, countDraftChanges, emptyRolePermissionDraft, parseRolePermissionDraft,
  plannedPermission, updateRolePermission, updateRoleScope,
  type MatrixAction, type PermissionChoice, type RolePermissionDraft,
} from "@/platform/accessMatrix";
import type { ScreenContext } from "@/platform/registry";
import "./access-workspace.css";

type MatrixView = "apps" | "pages" | "review";
const SCOPE_OPTIONS: { value: AccessScope; label: string }[] = [
  { value:"none",label:"None" },{ value:"own",label:"Own records" },{ value:"assigned",label:"Assigned" },
  { value:"team",label:"Team" },{ value:"department",label:"Department" },
  { value:"business_unit",label:"Business unit" },{ value:"organization",label:"Organisation" },{ value:"explicit",label:"Explicit sharing" },
];
const GRID_ACTIONS:MatrixAction[]=["view","create","edit","approve","export","share","delete","manage"];

function PermissionSelect({ value, label, onChange, disabled }: {
  value: PermissionChoice; label:string; onChange:(value:PermissionChoice)=>void; disabled?:boolean;
}) {
  return <select className="aw-matrix-select" value={value} aria-label={label}
    onChange={event=>onChange(event.target.value as PermissionChoice)} disabled={disabled}>
      <option value="inherit">Inherit</option>
      <option value="allow">Allow (draft)</option>
      <option value="deny">Deny (draft)</option>
    </select>;
}

/** Writes auditable browser-local DRAFT records only, never the effective security policy. */
export function AccessPermissionMatrix({ roleId, context }: { roleId:string; context:ScreenContext }) {
  const { rows, loaded } = useCollectionState("policies");
  const existing = rows.find(row=>row.fields.kind==="rolePermissionDraft" && row.fields.roleId===roleId);
  const [draft,setDraft] = useState<RolePermissionDraft>(()=>emptyRolePermissionDraft(roleId));
  const [view,setView] = useState<MatrixView>("apps");
  const [appCode,setAppCode] = useState("FIN");
  const [filter,setFilter] = useState("");
  const [group,setGroup] = useState("All");
  const [changedOnly,setChangedOnly] = useState(false);
  const [dirty,setDirty] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const writable=can(context.role,"manage_policy");
  const template=roleTemplate(roleId);
  const original=useMemo(()=>parseRolePermissionDraft(existing?.fields.matrix,roleId),
    [existing?.fields.matrix,roleId]);
  useEffect(()=>{
    if (!loaded) return;
    setDraft(original);
    setDirty(false);
    setError("");
  },[loaded,existing?.id,existing?.revision,roleId,original]);
  const apps=useMemo(()=>applications.filter(app=>
    (group==="All" || NAV_GROUPS.some(g=>g.label===group && g.apps.some(x=>x.code===app.code))) &&
    `${app.code} ${app.name}`.toLowerCase().includes(filter.toLowerCase()) &&
    (!changedOnly || Boolean(Object.keys(draft.appRules[app.code]??{}).length || draft.scopes[app.code])),
  ),[group,filter,changedOnly,draft.appRules,draft.scopes]);
  const currentPages=useMemo(()=>screens.filter(page=>page.applicationCode===appCode &&
    `${page.title} ${page.id}`.toLowerCase().includes(filter.toLowerCase()) &&
    (!changedOnly || Boolean(Object.keys(draft.pageRules[page.id]??{}).length))),
    [appCode,filter,changedOnly,draft.pageRules]);
  const tableRows = view==="apps"
    ? apps.map(app=>({ key:app.code, app:app.code, pageId:undefined as string|undefined, title:app.name }))
    : currentPages.map(page=>({ key:page.id, app:page.applicationCode, pageId:page.id as string|undefined, title:page.title }));
  const edits=countDraftChanges(draft);
  const applyRule=(level:"application"|"page",key:string,action:MatrixAction,choice:PermissionChoice)=>{
    setDraft(previous=>updateRolePermission(previous,level,key,action,choice));
    setDirty(true);
  };
  const applyScope=(key:string,scope:AccessScope)=>{
    setDraft(previous=>updateRoleScope(previous,key,scope));
    setDirty(true);
  };
  const reset=()=>{setDraft(original);setDirty(false);setError("");};
  const save=async()=>{
    if (!writable || busy || !dirty) return;
    setBusy(true);setError("");
    const title=`${template?.name??roleId} · View & edit permissions`;
    const fields={ kind:"rolePermissionDraft", roleId, matrix:JSON.stringify(draft), editedBy:context.actor, proposalOnly:true };
    try {
      if(existing){
        const updated=await context.mutate.patch(existing.id,{
          title,summary:`${edits} proposed permission overrides. No live access changed.`,
          fields:{...existing.fields,...fields},status:"draft"
        },{event:`Permission matrix draft updated: ${roleId}`,expectRevision:existing.revision});
        if(!updated){setError("This draft changed elsewhere. Review its latest version before saving.");return;}
      }else{
        await context.mutate.create({
          collection:"policies",title,status:"draft",
          summary:`${edits} proposed permission overrides. No live access changed.`,fields
        },`Permission matrix draft created: ${roleId}`);
      }
      setDirty(false);
      context.toast("Permission draft saved", "Your view and edit rules are saved in this browser workspace. No employee access was changed.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to save this permission draft.");}
    finally{setBusy(false);}
  };
  const pendingLabel=dirty?"Unsaved changes":existing?"Saved draft":"No saved draft";
  if(!template || !ROLE_TEMPLATES.some(r=>r.id===roleId))return <p>Choose a registered role template.</p>;
  return <section className="aw-perm-editor" aria-label="View and edit permissions matrix">
    <div className="aw-perm-head">
      <div className="aw-perm-title"><FilePenLine size={20}/>
        <div><h3>Control what this role can see and edit</h3>
          <p>{template.name} · {pendingLabel} · {edits} proposed overrides</p>
        </div>
      </div>
      <div className="aw-perm-commands">
        <button type="button" className="aw-perm-button secondary" onClick={reset} disabled={!dirty||busy}><RotateCcw size={14}/> Discard changes</button>
        <button type="button" className="aw-perm-button primary" onClick={()=>void save()} disabled={!writable||busy||!dirty||!loaded}>
          <Save size={14}/> {busy?"Saving…":"Save permission draft"}
        </button>
      </div>
    </div>
    <div className="aw-perm-disclosure"><ShieldAlert size={17}/>
      <div><strong>Proposed permissions only — not applied to employees</strong>
        <p>Use these controls to design view, create, edit, approval, export and management access. Changes are saved as a browser-local draft for review. They do not change authenticated user permissions or protect confidential records.</p>
      </div>
    </div>
    {!writable&&<p className="aw-perm-note">Your current role can inspect the matrix but cannot save an access-policy draft.</p>}
    <div className="aw-perm-tabs" role="group" aria-label="Permission matrix sections">
      <button type="button" aria-pressed={view==="apps"} onClick={()=>{setView("apps");setFilter("");}}><Eye size={14}/> Application permissions</button>
      <button type="button" aria-pressed={view==="pages"} onClick={()=>{setView("pages");setFilter("");}}><FilePenLine size={14}/> Page permissions</button>
      <button type="button" aria-pressed={view==="review"} onClick={()=>{setView("review");setFilter("");}}><CheckCheck size={14}/> Review changes ({edits})</button>
    </div>
    {view!=="review"&&<div className="aw-perm-filters">
      <input type="search" aria-label="Search permission rows" value={filter}
        placeholder={view==="apps"?"Search all 35 applications":"Search page titles"} onChange={e=>setFilter(e.target.value)}/>
      {view==="apps"
        ? <select aria-label="Filter by application group" value={group} onChange={e=>setGroup(e.target.value)}>
            <option value="All">All categories</option>{NAV_GROUPS.map(g=><option key={g.label} value={g.label}>{g.label}</option>)}
          </select>
        : <select aria-label="Select application for page permissions" value={appCode} onChange={e=>setAppCode(e.target.value)}>
            {applications.map(app=><option key={app.code} value={app.code}>{app.name}</option>)}
          </select>}
      <label className="aw-perm-filtercheck"><input type="checkbox" checked={changedOnly} onChange={e=>setChangedOnly(e.target.checked)}/> Changed only</label>
    </div>}
    {(view==="apps"||view==="pages")&&<div className="aw-perm-scroll" role="region" aria-label={view==="apps"?"Application permission table":"Page permission table"} tabIndex={0}>
      <table className="aw-perm-table">
        <thead><tr><th scope="col">{view==="apps"?"Application":"Page / screen"}</th>
          <th scope="col">Effective view*</th><th scope="col">Effective edit*</th>
          {GRID_ACTIONS.map(a=><th key={a} scope="col">{a[0].toUpperCase()+a.slice(1)}</th>)}
          {view==="apps"&&<th scope="col">Data scope</th>}
        </tr></thead>
        <tbody>{tableRows.map(item=>{
          const { app, pageId, key } = item;
          const level=view==="apps"?"application":"page";
          const viewDecision=plannedPermission(roleId,app,pageId,"view",draft);
          const editDecision=plannedPermission(roleId,app,pageId,"edit",draft);
          const row=draft[level==="application"?"appRules":"pageRules"][key]??{};
          const sensitive=view==="pages" && viewDecision.restricted;
          return <tr key={key}>
            <th scope="row"><div className="aw-perm-identity">
              <strong>{item.title}</strong>
              <small>{view==="apps"?app:pageId}</small>
              {sensitive&&<span className="aw-perm-sensitive"><LockKeyhole size={11}/> Sensitive</span>}
              {view==="apps"&&<button className="aw-perm-drill" type="button" onClick={()=>{setAppCode(app);setView("pages");setFilter("");}}>Inspect pages</button>}
            </div></th>
            <td><span className="aw-perm-status" data-allowed={viewDecision.allowed}>{viewDecision.allowed?"View":"No view"}</span></td>
            <td><span className="aw-perm-status" data-allowed={editDecision.allowed}>{editDecision.allowed?"Edit":"No edit"}</span></td>
            {GRID_ACTIONS.map(a=><td key={a}><PermissionSelect
              value={row[a]??"inherit"}
              label={`${view==="apps"?"Application":"Page"} ${key} ${a} rule`}
              disabled={!writable}
              onChange={choice=>applyRule(level,key,a,choice)}/></td>)}
            {view==="apps"&&<td><select className="aw-matrix-select" aria-label={`Application ${app} data scope`}
              value={draft.scopes[app]??template.scope}
              disabled={!writable} onChange={e=>applyScope(app,e.target.value as AccessScope)}>
              {SCOPE_OPTIONS.map(sc=><option key={sc.value} value={sc.value}>{sc.label}</option>)}
              </select></td>}
          </tr>;
        })}</tbody>
      </table>
      {tableRows.length===0&&<p className="aw-empty">No matching permission rows.</p>}
    </div>}
    {view==="review"&&<div className="aw-perm-review">
      <p>Review each exception before saving. Explicit draft denies override page-level allows; edit requires view.</p>
      {Object.entries(draft.appRules).map(([code,rules])=><div className="aw-perm-review-row" key={code}>
        <strong>{applications.find(a=>a.code===code)?.name??code}</strong><span>{Object.entries(rules).map(([action,choice])=>`${action}: ${choice}`).join(" · ")}</span>
      </div>)}
      {Object.entries(draft.pageRules).map(([id,rules])=><div className="aw-perm-review-row" key={id}>
        <strong>{screens.find(s=>s.id===id)?.title??id}</strong><span>{Object.entries(rules).map(([action,choice])=>`${action}: ${choice}`).join(" · ")}</span>
      </div>)}
      {Object.entries(draft.scopes).map(([code,scope])=><div className="aw-perm-review-row" key={`scope:${code}`}>
        <strong>{code} · Data scope</strong><span>{scope.replaceAll("_"," ")}</span>
      </div>)}
      {edits===0&&<p className="aw-empty">No overrides yet. The role follows its inherited template.</p>}
    </div>}
    {error&&<p className="aw-perm-error" role="alert">{error}</p>}
    <div className="aw-perm-foot">
      <span>*Effective columns reflect the proposed draft, not live authenticated access. Sensitive fields, approvals and record relationships require server enforcement.</span>
      <span>{loaded?pendingLabel:"Loading saved draft…"}</span>
    </div>
  </section>;
}
