import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, CircleDashed, FileText, LockKeyhole, ShieldAlert } from "lucide-react";
import { appEntry } from "@/app/catalog";
import { routeForRecord } from "@/platform/attention";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./flagship-lighthouse.css";

type Lens="journey"|"creative"|"client"|"delivery"|"commercial";
type Linkage={id:string;app:string;label:string;detail:string;section:Lens};
const PROJECT="nl-projects-900";
const RECORDS:Linkage[]=[
  {id:"nl-deals-910",app:"CRM",label:"Hospitality opportunity",detail:"£185,000 indicative scope; proposal stage",section:"journey"},
  {id:"nl-contacts-910",app:"CRM",label:"Customer contact",detail:"Fictional Lighthouse client representative",section:"journey"},
  {id:"nl-quotes-900",app:"CRM",label:"Lighting specification quote",detail:"Unissued quotation / no accepted commercial terms",section:"commercial"},
  {id:"nl-contracts-900",app:"LEGAL",label:"Project draft agreement",detail:"No signature recorded; legal review required",section:"commercial"},
  {id:"nl-invoices-900",app:"FIN",label:"Deposit invoice draft",detail:"£37,000 demonstration draft; not issued or paid",section:"commercial"},
  {id:"nl-designs-911",app:"DESIGN",label:"Spatial concept boards",detail:"Two original editable design artboards",section:"creative"},
  {id:"nl-documents-900",app:"DOCS",label:"Original creative brief",detail:"Project direction, scope, materials and outcomes",section:"creative"},
  {id:"nl-documents-1600",app:"DOCS",label:"Client review cover pack",detail:"Internal issue 01; prepared but not released",section:"creative"},
  {id:"nl-documents-1601",app:"DOCS",label:"Material choice A–B",detail:"Brushed versus blackened brass; decision outstanding",section:"creative"},
  {id:"nl-documents-1602",app:"DOCS",label:"Prototype acceptance criteria",detail:"Technical, repairability and client sign-off checklist",section:"creative"},
  {id:"nl-portals-1600",app:"PORTAL",label:"Prepared customer portal",detail:"Five native pages; zero invitations; draft-only",section:"client"},
  {id:"nl-approvals-1600",app:"PROJECT",label:"Creative direction review",detail:"Internal approval gate: pending",section:"client"},
  {id:"nl-approvals-1601",app:"LEGAL",label:"Commercial and legal review",detail:"Scope and terms: pending",section:"client"},
  {id:"nl-approvals-1602",app:"PORTAL",label:"Client release authority",detail:"Recipient, access and expiration: pending",section:"client"},
  {id:"nl-approvals-1603",app:"PROC",label:"Spending approval",detail:"Supplier and sample authorisation: pending",section:"client"},
  {id:"nl-approvals-1604",app:"PROJECT",label:"Prototype acceptance",detail:"Compliance and client review: pending",section:"client"},
  {id:"nl-tickets-1600",app:"CARE",label:"Finish comparison question",detail:"Internal customer-service scenario; no customer message",section:"client"},
  {id:"nl-requisitions-1600",app:"PROC",label:"Brass sample requisition",detail:"£2,800 proposal; not authorised or dispatched",section:"delivery"},
  {id:"nl-suppliers-900",app:"PROC",label:"Studio Metals / supplier candidate",detail:"Prospect supplier; not approved",section:"delivery"},
  {id:"nl-purchaseOrders-900",app:"PROC",label:"Lighthouse purchasing plan",detail:"£26,400 draft; no supplier commitment",section:"delivery"},
  {id:"nl-risks-1600",app:"LEGAL",label:"Material quality risk",detail:"Finish variability and replacement-parts risk",section:"delivery"},
  {id:"nl-risks-1601",app:"LEGAL",label:"Client sign-off exposure",detail:"Publication and spend blocked until review",section:"delivery"},
];
const STAGES=[
  {number:"01",heading:"The brief",caption:"Customer opportunity identified",id:"nl-deals-910",app:"CRM",section:"journey" as Lens},
  {number:"02",heading:"The concept",caption:"Art direction and specification draft",id:"nl-designs-911",app:"DESIGN",section:"creative" as Lens},
  {number:"03",heading:"The review",caption:"Internal and client gates pending",id:"nl-approvals-1600",app:"PROJECT",section:"client" as Lens},
  {number:"04",heading:"The materials",caption:"Supplier and sample authorisation pending",id:"nl-purchaseOrders-900",app:"PROC",section:"delivery" as Lens},
  {number:"05",heading:"The agreement",caption:"Commercial scope and draft billing",id:"nl-invoices-900",app:"FIN",section:"commercial" as Lens},
  {number:"06",heading:"The handover",caption:"Not started; no verified delivery",id:"nl-tasks-905",app:"PROJECT",section:"journey" as Lens},
];
const lenses:{id:Lens;label:string;description:string}[]=[
  {id:"journey",label:"Project trail",description:"The six-stage project narrative and linked task progression."},
  {id:"creative",label:"Design & research",description:"Actual native creative documents and reviewable vector studies."},
  {id:"client",label:"Client review",description:"Portal access, contact questions and human approval gates."},
  {id:"delivery",label:"Supply & delivery",description:"Unsubmitted purchasing, sourcing questions, and operational risks."},
  {id:"commercial",label:"Commercial",description:"The commercial chain without fictional payments or posted accounting."},
];
const GROUPS=["projects","deals","contacts","companies","quotes","contracts","invoices","designs","documents","portals","approvals","tickets","requisitions","suppliers","purchaseOrders","risks","tasks"];
const statusLabel=(s:string)=>s.replace(/_/g," ");
function route(rec:Rec|undefined,app:string,slug:string){
  if(!rec)return appEntry(app,slug);
  if(rec.collection==="portals")return `/o/${slug}/portal/portals/nl-portals-900/builder`;
  return routeForRecord(rec,slug)??appEntry(app,slug);
}
function find(all:Record<string,Rec[]>,id:string):Rec|undefined {
  const parts=id.split("-");
  return (all[parts[1]]??[]).find(r=>r.id===id && r.fields.flagship==="Northline Collective");
}
function ProgressRow({title,done,detail}:{title:string;done:boolean;detail:string}){
  return <div className="lh-gate" data-complete={done}>
    {done?<CheckCircle2 size={17} aria-hidden="true"/>:<CircleDashed size={17} aria-hidden="true"/>}
    <div><strong>{title}</strong><p>{detail}</p></div><span>{done?"Verified":"Outstanding"}</span>
  </div>;
}
export default function FlagshipLighthouse(){
  const {org,role}=useWorkspace();
  const all=useCollections(GROUPS);
  const [tab,setTab]=useState<Lens>("journey");
  const project=find(all,PROJECT);
  const portal=find(all,"nl-portals-1600");
  const reviewDocs=["nl-documents-1600","nl-documents-1601","nl-documents-1602"].map(id=>find(all,id)).filter((r):r is Rec=>Boolean(r));
  const allGates=Array.from({length:5},(_,i)=>find(all,`nl-approvals-${1600+i}`)).filter((r):r is Rec=>Boolean(r));
  const verifiedGates=allGates.filter(r=>r.status==="approved").length;
  const work=[...(all.tasks??[])].filter(r=>r.fields.projectId===PROJECT && r.fields.flagship==="Northline Collective");
  const completed=work.filter(r=>["done","completed"].includes(r.status)).length;
  const portalBody=(portal?.body??{}) as {pages?:{id:string}[];shared?:{collection:string;ids:string[]}[];users?:unknown[];releaseGates?:{scopeReviewed?:boolean;clientApproved?:boolean;invitationSent?:boolean}};
  const sharedIds=(portalBody.shared??[]).flatMap(scope=>scope.ids);
  const gates=portalBody.releaseGates;
  const ready=Boolean(portal && portal.status==="live" && gates?.scopeReviewed && gates.clientApproved && gates.invitationSent && verifiedGates===allGates.length && allGates.length===5);
  const visible=RECORDS.filter(r=>r.section===tab);
  const value=(minor:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(minor/100);
  if(org.slug!=="northline"||role==="client")return <div className="lh-not-authorised">
    <LockKeyhole size={27}/><h1>Internal casefile unavailable</h1>
    <p>This fictional casefile is only available in Northline's internal browser-local workspace. A Client role preview cannot inspect draft approvals or sourcing records.</p>
    <Link to={`/o/${org.slug}/workspace/home`}>Return to your workspace <ArrowRight size={16}/></Link>
  </div>;
  return <main className="lh">
    <div className="lh-top"><Link to={`/o/${org.slug}/workspace/showcase`}><ArrowLeft size={17}/> Northline flagship</Link><span>CASEFILE / LH—001 / FICTIONAL</span></div>
    <header className="lh-cover">
      <div className="lh-cover-copy"><p>ATELIER / HOSPITALITY & LIGHTING / 01</p>
        <h1>Light as <em>architecture.</em></h1>
        <span className="lh-sub">LIGHTHOUSE HOTELS — 45 GUEST ROOMS</span>
        <p className="lh-lede">A connected project from the first brief to a possible handover. Explore how creative decisions meet customer relationships, material sourcing, legal review and commercial accountability.</p>
        <div className="lh-primary-actions"><Link to={route(project,"PROJECT",org.slug)}>Open the native project <ArrowUpRight size={17}/></Link><a href="#casefile">Explore linked records <ArrowRight size={17}/></a></div>
      </div>
      <div className="lh-art" aria-label="Abstract original vector study of architectural arches and acid-yellow light" role="img">
        <span className="lh-plane lh-plane-a"/><span className="lh-plane lh-plane-b"/><span className="lh-arch"/><span className="lh-portal"/><span className="lh-light"/><span className="lh-art-note">MATERIAL STUDY / 01<br/> LIGHTHOUSE HOTELS</span>
      </div>
    </header>
    <div className="lh-measure" aria-label="Fictional project scope and status">
      <div><span>PROPOSED SCOPE</span><strong>{value(project?.amountMinor??18500000)}</strong><small>Illustrative / not accepted revenue</small></div>
      <div><span>ROOMS IN CONCEPT</span><strong>45</strong><small>Three room typologies</small></div>
      <div><span>LINKED TASKS</span><strong>{work.length? `${completed}/${work.length}`:"—"}</strong><small>Fictional task progression</small></div>
      <div><span>APPROVAL GATES</span><strong>{verifiedGates}/{allGates.length||5}</strong><small>Verified decisions</small></div>
    </div>
    <section className="lh-gate-banner" role="note"><ShieldAlert size={24}/><div><strong>No external project delivery or approval has been verified.</strong>
      <p>The quote, agreement, purchasing plan, client portal and invoice are drafts. This casefile demonstrates linked application workflows; it does not assert a real contract, order, payment, meeting or client decision.</p></div></section>
    <section id="casefile" className="lh-casefile">
      <header className="lh-section-head"><span>01 / THE WORKING FILE</span><div><h2>Every decision, <em>connected.</em></h2><p>Select a workstream and open its underlying record in Arlovi. All displayed statuses are read from the current workspace's local data.</p></div></header>
      <nav className="lh-tabs" aria-label="Lighthouse project workstreams">{lenses.map(l=><button key={l.id} type="button" onClick={()=>setTab(l.id)} aria-current={tab===l.id?"page":undefined}>{l.label}</button>)}</nav>
      <div className="lh-view" aria-live="polite">
        <div className="lh-view-head"><span>SELECTED WORKSTREAM</span><h3>{lenses.find(l=>l.id===tab)?.label}</h3><p>{lenses.find(l=>l.id===tab)?.description}</p></div>
        {tab==="journey"&&<div className="lh-stages">{STAGES.map(stage=>{
          const record=find(all,stage.id);
          return <button type="button" key={stage.number} onClick={()=>setTab(stage.section)} className="lh-stage">
            <span className="lh-stage-number">{stage.number}</span><div><h4>{stage.heading}</h4><p>{stage.caption}</p>
              <small>{record? `Record: ${statusLabel(record.status)}`:"Record not loaded"}</small></div><ArrowRight size={16}/></button>;
        })}</div>}
        {tab==="client"&&<div className="lh-portal-readiness">
          <div className="lh-readiness-intro"><span>CLIENT PORTAL / DRAFT</span><h4>{portal?.title??"Not loaded"}</h4><p>Only explicit review documents are prepared for a future portal. No customer has been invited or signed in.</p>
            <div className="lh-readiness-counts"><div><strong>{portalBody.pages?.length??0}</strong><span>Portal pages</span></div><div><strong>{sharedIds.length}</strong><span>Files in draft share scope</span></div><div><strong>{portalBody.users?.length??0}</strong><span>Invited external users</span></div></div>
            <Link to={route(portal,"PORTAL",org.slug)}>Open internal Portal Builder <ArrowUpRight size={17}/></Link></div>
          <div className="lh-readiness-gates"><ProgressRow title="Review scope and documents" done={gates?.scopeReviewed===true} detail="File list and recipient-specific access must be verified."/>
            <ProgressRow title="Authorised client approval" done={gates?.clientApproved===true} detail="No client decision has been captured."/>
            <ProgressRow title="Invitation sent" done={gates?.invitationSent===true} detail="No connected email or access invitation exists."/>
            <div className="lh-release-result" data-ready={ready}>{ready?"Client review release is verified":"Client review is not released"}</div>
          </div>
        </div>}
        <div className="lh-record-grid">{visible.map(entry=>{
          const record=find(all,entry.id);
          const href=route(record,entry.app,org.slug);
          const noDetail=["approvals","requisitions","purchaseOrders","risks"].includes(record?.collection??"");
          return <Link key={entry.id} className="lh-record" to={href}>
            <div><span>{entry.app} / {record?.collection?.toUpperCase()??"PENDING"}</span>
              <span className="lh-record-status" data-state={record?.status??"missing"}>{record?statusLabel(record.status):"not loaded"}</span></div>
            <h4>{record?.title??entry.label}</h4><p>{record?.summary||entry.detail}</p>
            <small>{noDetail?"Open the native collection":"Open native record"} <ArrowUpRight size={15}/></small>
          </Link>;
        })}</div>
        {tab==="creative"&&<p className="lh-note"><FileText size={17}/> {reviewDocs.length} draft client-facing documents are prepared for a future restricted portal review. Design source remains editable inside Arlovi.</p>}
        {tab==="commercial"&&<p className="lh-note"><LockKeyhole size={17}/> The quote is unaccepted; the agreement is unsigned; the invoice is unissued and unpaid. This workflow does not post a ledger transaction.</p>}
        {tab==="delivery"&&<p className="lh-note"><ShieldAlert size={17}/> The selected supplier is a prospect; purchasing requires approval. No samples have been received.</p>}
      </div>
    </section>
    <section className="lh-next"><span>02 / WHAT HAS TO HAPPEN</span><h2>Nothing goes live<br/><em>by accident.</em></h2>
      <div><p>There is a clear boundary between a considered concept and a signed, delivered project. First verify the creative direction, contract, supplier suitability, technical compliance and external access scope. Only then can client invitations, spending and invoicing be considered.</p><Link to={route(project,"PROJECT",org.slug)}>Return to the project board <ArrowUpRight size={17}/></Link></div></section>
    <footer className="lh-footer"><span>NORTHLINE COLLECTIVE / LIGHTHOUSE CASEFILE 001</span><span>ARLOVI / FICTIONAL BROWSER-LOCAL DEMONSTRATION</span></footer>
  </main>;
}
