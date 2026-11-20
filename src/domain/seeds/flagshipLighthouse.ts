import { registerSeed } from "@/domain/seedRegistry";
import type { Rec } from "@/domain/types";
import { NORTHLINE_COLORS } from "@/domain/flagship/identity";

/**
 * Lighthouse Hotels project — client and production readiness.
 *
 * Canonical portal extends the original nl-portals-900 concept stub without
 * replacing any existing record/user edits. The draft portal cannot grant
 * authenticated client access. Only three explicitly named draft documents
 * are scoped for a future review; invoices and internal supplier costs remain
 * private until a human publishes and shares them.
 */
const N=1600;
const project="nl-projects-900";
const company="nl-companies-910";
const contact="nl-contacts-910";
const portalStub="nl-portals-900";
const portalCanonical="nl-portals-1600";
const sourceDesign="nl-designs-911";
const nId=(collection:string,i:number)=>`nl-${collection}-${N+i}`;

registerSeed("flagship-lighthouse-review",ctx=>{
  const records:Rec[]=[];
  const push=(collection:string,n:number,title:string,detail:{
    status?:string;summary?:string;amountMinor?:number;parentId?:string;
    fields?:Record<string,string|number|boolean>;body?:unknown;
  }={})=>records.push(ctx.rec({
    org:"nl",collection,n:N+n,title,status:detail.status??"draft",
    owner:"Northline Atelier",summary:detail.summary??"Fictional project review, browser-local only.",
    amountMinor:detail.amountMinor,parentId:detail.parentId,
    tags:["flagship","lighthouse","fictional","client_review"],
    fields:{flagship:"Northline Collective",projectId:project,companyId:company,
      fictional:true,externalState:"not_connected",...detail.fields},
    body:detail.body,
  }));

  const pages=[
    {id:"overview",name:"Overview",modules:["welcome","milestones","next-actions"],gate:"any_member"},
    {id:"documents",name:"Files",modules:["documents"],gate:"any_member"},
    {id:"requests",name:"Requests",modules:["requests"],gate:"any_member"},
    {id:"messages",name:"Messages",modules:["thread"],gate:"any_member"},
    {id:"billing",name:"Billing",modules:["invoices"],gate:"billing_contact"},
  ];
  push("portals",0,"Lighthouse Hotels / client design review",{
    status:"draft",
    summary:"Client review space prepared but unpublished. Zero external members, zero invitations and no client activity claimed.",
    fields:{audience:"client",contactId:contact,canonicalFor:portalStub,
      accent:NORTHLINE_COLORS.violet,customDomain:"",domainVerified:false,
      externalUsers:0,invitesPending:0,visits90d:0,lastVisitAt:"",
      publishedAt:"",inheritsInternalAccess:false,linkExpiryDays:14,
      termsVersion:"draft",delivery:"local_only",approvalGate:"pending"},
    body:{
      pages,
      shared:[{collection:"documents",ids:[
        nId("documents",0),nId("documents",1),nId("documents",2),
      ]}],
      users:[],
      activity:[{at:"2026-11-18T09:30:00.000Z",actor:"Northline Atelier",
        detail:"Internal preparation of a draft review portal. Not published and not sent."}],
      releaseGates:{scopeReviewed:false,clientApproved:false,invitationSent:false},
    },
  });

  const documents=[
    {
      title:"Lighthouse / design review cover pack",
      subtitle:"Review issue 01 — internal draft",
      content:"LIGHTHOUSE HOTELS / DESIGN REVIEW PACK\n45 guest rooms · concept and materials\n\nA consistent experience through thoughtful contrasts: warm metal, soft light and repairable parts.\n\nWhat is being reviewed: the visual direction, two brass finishes, maintenance access and a room prototype.\n\nDecision required: internal creative review, legal/commercial review, client invitation and client acknowledgement. No approval has occurred.\n\nCreative source: nl-designs-911 (editable concept boards).",
      kind:"client_review",
    },
    {
      title:"Lighthouse / material choice A–B",
      subtitle:"Brushed brass vs blackened brass",
      content:"MATERIAL CHOICE / 01\n\nOption A — Brushed brass\nA softer warm character; visible patina is part of the design intent. Verify care and replacement-part accessibility.\n\nOption B — Blackened brass\nA quieter graphic profile; review coating longevity, abrasion risks and sample consistency.\n\nDesign question: Which finish better serves both the guest experience and the hotel's maintenance programme?\n\nSamples are not claimed to have been manufactured or dispatched. No client response has been received.",
      kind:"material_options",
    },
    {
      title:"Lighthouse / prototype acceptance checklist",
      subtitle:"Approval criteria / unverified",
      content:"ROOM PROTOTYPE / ACCEPTANCE CHECKLIST\n\n[ ] Design intent approved by authorised internal reviewer\n[ ] Photometric modelling checked\n[ ] Electrical and safety specification verified by qualified professional\n[ ] Sample material sources documented\n[ ] Repairability and replacement-parts review complete\n[ ] Room installation process validated\n[ ] Client approvals recorded from an authorised channel\n[ ] Procurement and financial authority granted\n\nThis document is a preparatory checklist and does not constitute evidence of a completed inspection.",
      kind:"prototype_checklist",
    },
  ];
  documents.forEach((document,i)=>push("documents",i,document.title,{
    status:"draft",summary:document.subtitle,
    fields:{type:document.kind,portalReviewCandidate:true,portalId:portalCanonical,
      clientVisibleAfterPublish:true,designFileId:sourceDesign,approved:false},
    body:{content:document.content},
  }));

  const gates=[
    ["Design review / internal creative approval","Creative Director","pending",
      "Confirm direction, asset rights and visual specifications before external review."],
    ["Commercial and legal review / scope","Legal & Finance","pending",
      "Validate draft quote and contract; do not imply a committed order."],
    ["Client review portal / release authority","Account Director","pending",
      "Review exact shared records, access rules, recipient and expiry before any invitation."],
    ["Materials procurement / spending authority","Procurement Lead","pending",
      "Approve supplier credentials and requisition only after client selection and internal approval."],
    ["Prototype acceptance / technical compliance","Project Lead","pending",
      "Verify installation, electrical and maintenance requirements; no test has occurred."],
  ];
  gates.forEach(([name,assignee,status,description],i)=>push("approvals",i,name,{
    status,summary:description,
    fields:{scope:"lighthouse",assignee,requestedBy:"Northline Atelier",
      linkedId:project,projectId:project,decision:"pending",approvalKind:"review_gate",
      clientDecision:i===2,verificationRequired:true},
  }));

  const tasks=[
    ["Prepare annotated lighting plan","Design & Studio","in_progress",sourceDesign,"Review how the three room types differ in task, ambient and accent light."],
    ["Document finishes and material traceability","Procurement","todo",nId("documents",1),"Request material provenance evidence before any purchase."],
    ["Check right-to-repair and maintenance access","Design & Studio","todo",nId("documents",2),"Confirm serviceability of fittings and replacement parts."],
    ["Run prototype technical compliance review","Project Delivery","todo",nId("documents",2),"Qualified reviewer must verify electrical and installation requirements."],
    ["Approve commercial and legal scope","Finance & Governance","todo","nl-contracts-900","Quote and agreement remain unissued drafts."],
    ["Review external portal sharing boundaries","Account Director","todo",portalCanonical,"Check shared files and recipient-specific permissions before publication."],
    ["Authorise materials sample procurement","Procurement","todo","nl-purchaseOrders-900","Do not order from an unapproved prospect supplier."],
    ["Record approved client feedback","CRM","todo",portalCanonical,"No external response has been received or assumed."],
  ];
  tasks.forEach(([name,team,status,linkedId,description],i)=>push("tasks",i,"Lighthouse / "+name,{
    status,parentId:project,summary:description,
    fields:{projectId:project,department:team,linkedRecordId:linkedId,
      phase:i<3?"concept":i<6?"review":"delivery",verifiedComplete:false},
  }));

  push("requisitions",0,"Lighthouse / brass sample request",{
    status:"draft",amountMinor:280000,
    summary:"Suggested sample spend £2,800 before VAT. No supplier has accepted or fulfilled the request.",
    fields:{projectId:project,supplierId:"nl-suppliers-900",approval:"pending",
      purchaseOrderId:"nl-purchaseOrders-900",netMinor:280000,
      receiptState:"not_received"},
    body:{lines:[{id:"sample-a",name:"Brushed brass prototype",quantity:2,unitMinor:65000},
      {id:"sample-b",name:"Blackened brass prototype",quantity:2,unitMinor:75000}]},
  });

  push("risks",0,"Lighthouse / material quality and replacement-parts risk",{
    status:"open",
    summary:"Potential finish variability and service replacement intervals require technical evidence.",
    fields:{projectId:project,severity:"medium",riskOwner:"Northline Atelier",
      mitigation:"Obtain samples, accelerated test plan and spare-parts terms",
      verified:false},
  });
  push("risks",1,"Lighthouse / contractual and client sign-off boundary",{
    status:"open",
    summary:"Commercial and client approvals are not yet documented; block procurement and publication.",
    fields:{projectId:project,severity:"high",riskOwner:"Finance & Governance",
      mitigation:"Internal approval followed by client-issued confirmation",
      verified:false},
  });
  push("tickets",0,"Lighthouse / sample finish comparison question",{
    status:"open",summary:"Internal customer-service scenario: compare brushed and blackened brass; no external customer message received.",
    fields:{projectId:project,companyId:company,contactId:contact,
      channel:"internal_demo",priority:"normal",externalReplyReceived:false},
  });
  push("meetings",0,"Lighthouse / internal design review agenda",{
    status:"draft",
    summary:"Proposed agenda, not a held meeting or recorded client attendance.",
    fields:{projectId:project,meetingType:"internal",attendanceVerified:false,
      agenda:"Finish options, technical checks, portal scope and stage gates"},
  });

  return {records};
});
