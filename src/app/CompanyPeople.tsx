import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Building2, Check, Copy, Mail, Plus, Search, ShieldAlert, UserRound, Users, X } from "lucide-react";
import { appEntry } from "@/app/catalog";
import { useCollections, useMutations, useToast, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./company-people.css";

/** Local planning records only. Actual account invitations require authenticated delivery. */
export const MEMBERSHIP_COLLECTION = "spaceMemberships";
export const INVITATION_COLLECTION = "workspaceInvitationDrafts";
type Scope = { type: "project" | "department"; id: string; title: string } | null;
const ACCESS = ["viewer","contributor","manager"] as const;
type Access = typeof ACCESS[number];
function membershipMatches(record: Rec, scope: NonNullable<Scope>) {
  return record.status === "active" && record.fields.scopeId === scope.id && record.fields.scopeType === scope.type;
}
function getEmail(record: Rec): string {
  for (const k of ["email","workEmail","primaryEmail"]) {
    const value = record.fields[k];
    if (typeof value === "string" && value.includes("@")) return value;
  }
  return "";
}

export function CompanyPeople({ scope = null }: { scope?: Scope }) {
  const { org } = useWorkspace();
  const mutate = useMutations("workspace-people");
  const toast = useToast();
  const { members = [], departments = [], projects = [], spaceMemberships = [], workspaceInvitationDrafts: invitations = [] } = useCollections([
    "members","departments","projects",MEMBERSHIP_COLLECTION,INVITATION_COLLECTION,
  ]);
  const [query,setQuery] = useState("");
  const [person,setPerson] = useState("");
  const [level,setLevel] = useState<Access>("contributor");
  const [inviteName,setInviteName] = useState("");
  const [inviteEmail,setInviteEmail] = useState("");
  const [inviteLevel,setInviteLevel] = useState<Access>("viewer");
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [showInvite,setShowInvite] = useState(false);
  const [showMembership,setShowMembership] = useState(false);
  const assignments = scope ? spaceMemberships.filter(r=>membershipMatches(r,scope)) : spaceMemberships.filter(r=>r.status==="active");
  const assignedIds = new Set(assignments.map(r=>String(r.fields.memberId)));
  const scopedInvitations = scope ? invitations.filter(r=>r.fields.scopeId===scope.id&&r.fields.scopeType===scope.type) : invitations;
  const available = members.filter(member=>member.status!=="archived"&&member.status!=="suspended");
  const eligible = scope ? available.filter(r=>!assignedIds.has(r.id)) : [];
  const matches = available.filter(member=>[member.title,member.summary,getEmail(member)].join(" ").toLowerCase().includes(query.toLowerCase().trim()));
  const sorted = [...matches].sort((a,b)=>a.title.localeCompare(b.title));
  const getScopeName = (row: Rec) => {
    const id = row.fields.scopeId;
    return [...departments,...projects].find(r=>r.id===id)?.title ?? "Workspace";
  };
  async function perform(fn:()=>Promise<void>,label:string) {
    if(busy)return;
    setBusy(true);setError("");
    try {await fn();toast(label,"Saved in the local organisation workspace.");}
    catch(caught){setError(caught instanceof Error?caught.message:"Unable to save this change.");}
    finally{setBusy(false);}
  }
  function addMembership(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(!scope||!person)return;
    void perform(async()=>{
      const member=eligible.find(r=>r.id===person);
      if(!member)throw new Error("Choose an eligible company member.");
      const duplicate=spaceMemberships.some(r=>r.status==="active"&&r.fields.memberId===person&&r.fields.scopeId===scope.id&&r.fields.scopeType===scope.type);
      if(duplicate)throw new Error("This person is already assigned to this workspace.");
      await mutate.create({collection:MEMBERSHIP_COLLECTION,title:member.title,status:"active",summary:`Planned ${level} access to ${scope.title}; not an authenticated grant.`,
        fields:{memberId:member.id,scopeId:scope.id,scopeType:scope.type,accessLevel:level,source:"workspace-people"}},`Planned ${member.title} as ${level} in ${scope.title}`);
      setPerson("");setShowMembership(false);
    },"Workspace membership recorded");
  }
  async function setLevel(record:Rec,value:Access) {
    await perform(async()=>{
      const updated=await mutate.patch(record.id,{fields:{accessLevel:value},summary:`Planned ${value} access; not an authenticated grant.`},{expectRevision:record.revision,event:`Membership access plan updated to ${value}`});
      if(!updated)throw new Error("Membership changed in another window.");
    },"Planned access updated");
  }
  async function removeMember(record:Rec) {
    await perform(async()=>{
      const updated=await mutate.patch(record.id,{status:"archived"},{expectRevision:record.revision,event:"Removed local workspace membership association"});
      if(!updated)throw new Error("Membership changed in another window.");
    },"Workspace association removed");
  }
  function saveInvitation(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email=inviteEmail.trim().toLowerCase();
    const name=inviteName.trim();
    if(!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {setError("Enter a name and valid email.");return;}
    void perform(async()=>{
      if(invitations.some(r=>r.status==="draft"&&String(r.fields.email).toLowerCase()===email&&
         String(r.fields.scopeId||"")===(scope?.id||"")))
        throw new Error("A draft invitation for this email and workspace already exists.");
      await mutate.create({collection:INVITATION_COLLECTION,title:name,status:"draft",summary:"Unsent invitation draft. No external email, account or access grant created.",
        fields:{email,plannedRole:inviteLevel,deliveryStatus:"not_connected",source:"workspace-people",
          ...(scope?{scopeId:scope.id,scopeType:scope.type}:{})}},`Invitation draft prepared for ${email}; not sent`);
      setInviteName("");setInviteEmail("");setShowInvite(false);
    },"Invitation draft saved — not sent");
  }
  async function cancelDraft(record:Rec) {
    await perform(async()=>{
      const updated=await mutate.patch(record.id,{status:"cancelled"},{expectRevision:record.revision,event:"Invitation draft cancelled; no email was sent"});
      if(!updated)throw new Error("Invitation changed in another window.");
    },"Draft invitation cancelled");
  }
  const inviteCopy=(r:Rec)=>`Hello ${r.title},\n\nYou have been invited to join ${org.name}${scope?` in ${scope.title}`:""}. Please contact your company administrator to arrange account access.\n\nThis message is a draft and does not provide access to Arlovi.`;
  return <section className="cp-people" aria-label={scope?`${scope.title} people`:"Company people and collaboration"}>
    <div className="cp-heading"><div><h2>{scope?"Workspace people":"Company directory & collaboration"}</h2><p>{scope?`Plan the people involved in ${scope.title} and prepare invitations.`:"Review existing people records and draft collaboration requests."} Memberships shown here do not grant application access.</p></div><Users size={22}/></div>
    <div className="cp-notice" role="status"><ShieldAlert size={17}/><p><strong>Local collaboration planning</strong> — Arlovi does not yet support authenticated invitations, emailed access links or enforced multi-user workspace permissions. No emails will be sent.</p></div>
    <div className="cp-actions">
      {scope&&<button type="button" onClick={()=>setShowMembership(v=>!v)}><Plus size={16}/> Add existing person</button>}
      <button type="button" onClick={()=>setShowInvite(v=>!v)}><Mail size={16}/> Prepare invitation</button>
      <Link to={appEntry("HR",org.slug)}><UserRound size={16}/> People application</Link>
      <Link to={appEntry("ADMIN",org.slug)}><Building2 size={16}/> Administration</Link>
    </div>
    {error&&<p role="alert" className="cp-error">{error}</p>}
    {showMembership&&scope&&<form className="cp-form" onSubmit={addMembership}>
      <label>Company person<select required value={person} onChange={e=>setPerson(e.target.value)}><option value="">Choose existing person</option>{eligible.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
      <label>Planned access<select value={level} onChange={e=>setLevel(e.target.value as Access)}>{ACCESS.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
      <button type="submit" disabled={busy||!person}>Save membership</button><button type="button" onClick={()=>setShowMembership(false)} aria-label="Close membership form"><X size={16}/></button>
    </form>}
    {showInvite&&<form className="cp-form" onSubmit={saveInvitation}>
      <label>Name<input required maxLength={120} value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Full name"/></label>
      <label>Email<input required type="email" maxLength={254} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="name@example.com"/></label>
      <label>Proposed role<select value={inviteLevel} onChange={e=>setInviteLevel(e.target.value as Access)}>{ACCESS.map(a=><option key={a} value={a}>{a}</option>)}</select></label>
      <button type="submit" disabled={busy||!inviteName.trim()||!inviteEmail.trim()}>Save unsent draft</button><button type="button" onClick={()=>setShowInvite(false)} aria-label="Close invitation form"><X size={16}/></button>
    </form>}
    {scope&&<div className="cp-section"><h3>Workspace membership plan <span>{assignments.length}</span></h3>
      {assignments.length?<div className="cp-list">{assignments.map(row=><div className="cp-row" key={row.id}><div className="cp-avatar" aria-hidden="true">{row.title.slice(0,1).toUpperCase()}</div><div className="cp-person"><strong>{row.title}</strong><small>{available.find(p=>p.id===row.fields.memberId)?getEmail(available.find(p=>p.id===row.fields.memberId)!):"Company record unavailable"}</small></div><label className="cp-access">Planned access<select aria-label={`Planned access for ${row.title}`} value={String(row.fields.accessLevel||"viewer")} onChange={e=>void setLevel(row,e.target.value as Access)} disabled={busy}>{ACCESS.map(a=><option key={a} value={a}>{a}</option>)}</select></label><button type="button" className="cp-icon-btn" onClick={()=>void removeMember(row)} disabled={busy} aria-label={`Remove ${row.title} from workspace plan`}><X size={16}/></button></div>)}</div>:<p className="cp-empty">No people have been associated with this workspace yet.</p>}
    </div>}
    <div className="cp-section"><div className="cp-title"><h3>{scope?"Company members":"People in this company"} <span>{sorted.length}</span></h3><label className="cp-search"><Search size={15}/><input aria-label="Search company people" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search people"/></label></div>
      {sorted.length?<div className="cp-list">{sorted.map(member=><div className="cp-row" key={member.id}><div className="cp-avatar" aria-hidden="true">{member.title.slice(0,1).toUpperCase()}</div><div className="cp-person"><strong>{member.title}</strong><small>{getEmail(member)||member.summary||"Company member"}</small></div><span className="cp-status">{member.status.replace(/_/g," ")}</span>{scope&&assignedIds.has(member.id)&&<span className="cp-status"><Check size={13}/> Associated</span>}</div>)}</div>:<p className="cp-empty">No company people match your search.</p>}
    </div>
    {scopedInvitations.length>0&&<div className="cp-section"><h3>Invitation drafts <span>{scopedInvitations.filter(r=>r.status==="draft").length}</span></h3><div className="cp-list">{[...scopedInvitations].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30).map(draft=><div className="cp-row" key={draft.id}><Mail size={19}/><div className="cp-person"><strong>{draft.title}</strong><small>{String(draft.fields.email)} · {draft.status} · {scope?.title||"Company"} · not sent</small></div>{draft.status==="draft"&&<><button type="button" className="cp-action-btn" onClick={()=>{void navigator.clipboard?.writeText(inviteCopy(draft));}}><Copy size={14}/> Copy text</button><button type="button" className="cp-icon-btn" aria-label={`Cancel draft for ${draft.title}`} disabled={busy} onClick={()=>void cancelDraft(draft)}><X size={16}/></button></>}</div>)}</div></div>}
    <p className="cp-disclaimer">Planned roles and memberships are organisational notes, not authentication or security boundaries. Only a future server-authorised invitation and membership system can grant access.</p>
  </section>;
}
