import { registerSeed } from "@/domain/seedRegistry";
import { NORTHLINE_COLORS, NORTHLINE_COLLECTIVE_IDENTITY } from "@/domain/flagship/identity";
import type { Rec } from "@/domain/types";
import { LAYOUTS, THEMES, slideFromLayout, type Deck, type Slide } from "@/applications/present/model";

/**
 * Northline Collective flagship showcase.
 * Fictional material; no real clients, invoices, payments or publications.
 * All identifiers sit in a dedicated 9xx range so historical Northline Atelier
 * seed records and user edits remain untouched.
 *
 * The existing "nl" demo workspace represents the Collective's Atelier
 * operation. Harbor's separate USD workspace remains an independent demo;
 * it is NOT a subsidiary of the Collective.
 */
const BASE = 900;
const BRANDS = [
  { name: "Northline Collective", descriptor: "Material. Space. Experience.", accent: NORTHLINE_COLORS.acid },
  { name: "Northline Atelier", descriptor: "Spatial ideas and material thinking", accent: NORTHLINE_COLORS.violet },
  { name: "Harbor Supply Studio", descriptor: "Considered objects and useful forms", accent: NORTHLINE_COLORS.apricot },
  { name: "Northline Experiences", descriptor: "Gathering through making", accent: NORTHLINE_COLORS.bluePaper },
];
const PALETTE = {
  ink: NORTHLINE_COLORS.ink, canvas: NORTHLINE_COLORS.canvas,
  acid: NORTHLINE_COLORS.acid, violet: NORTHLINE_COLORS.violet,
  apricot: NORTHLINE_COLORS.apricot, bluePaper: NORTHLINE_COLORS.bluePaper,
  paper: NORTHLINE_COLORS.canvas, quiet: NORTHLINE_COLORS.muted,
};
const sitePage = (id: string, name: string, path: string, heading: string, description: string, blocks: unknown[]) => ({
  id, name, path, status: "draft",
  seo: { title: heading + " — Northline Collective", description, noindex: true },
  blocks: [
    { id: id+"-hero", type: "hero", props: { title: heading, body: description, align: "start", tone: "plain", padding: "roomy", ctaLabel: "Begin a conversation", ctaTarget: "/contact" } },
    ...blocks,
    { id: id+"-footer", type: "footer", props: { items: ["Our thinking", "The collective", "Contact"], body: "Northline Collective · A fictional Arlovi flagship demonstration · Not a live company", tone: "soft", padding: "tight" } },
  ],
});
const column = (id: string, title: string, items: string[]) => ({ id, type: "columns", props: { title, items, columns: 3 } });
const gallery = (id: string, title: string, items: string[]) => ({ id, type: "gallery", props: { title, items, columns: 3, alt: title + ", editorial project index" } });
const paragraph = (id: string, title: string, body: string) => ({ id, type: "text", props: { title, body } });
const WEB_BODY = {
  theme: { font: "Manrope", accent: PALETTE.acid, ink: PALETTE.ink, paper: PALETTE.canvas, radius: 0, scale: 100 },
  seo: { siteTitle: "Northline Collective — Material. Space. Experience.", description: "An independent collective working at the intersection of thoughtful objects, spaces and human experience.", robots: "noindex", sitemap: false },
  analytics: { consent: "not_asked" },
  pages: [
    sitePage("collective-home", "Home", "/", "Made for the way we live.", "A studio of distinct disciplines with one shared curiosity: how materials, places and experiences shape everyday life.", [
      column("collective-three", "Three ways of seeing", ["Atelier — spaces with soul", "Supply — considered objects", "Experiences — moments worth remembering"]),
      gallery("collective-index", "Selected stories", ["Lighthouse — light as architecture", "The Solace Collection — crafted for permanence", "Sunday Sessions — gathering around ideas"]),
      paragraph("collective-statement", "Not a style. A point of view.", "We believe a beautiful object earns its place through use. A considered space makes room for life. And the most memorable experiences make us feel something long after they end."),
    ]),
    sitePage("collective-work", "Selected Work", "/work", "A collection of considered work.", "From hospitality spaces to useful objects, our portfolio grows from observation, collaboration and the pleasure of making.", [
      gallery("work-featured", "01 / Places and objects", ["Lighthouse Hotels — 45 guest rooms", "The Solace Edit — 12 objects", "Morrow House — a residential retreat"]),
      paragraph("work-note", "Process is the product.", "Each case study moves through a clear sequence: insight, exploration, material testing, delivery and what we learned."),
    ]),
    sitePage("collective-atlier", "Atelier", "/atelier", "Spaces that stay with you.", "Interiors, lighting and environments shaped around the rhythm of human life.", [
      column("atelier-areas", "Our practice", ["Spatial direction and interiors", "Lighting concepts and specification", "Bespoke fabrication and installation"]),
      gallery("atelier-portfolio", "The practice in detail", ["Lighthouse Hotels", "Morrow House", "Clerkenwell Workshop"]),
    ]),
    sitePage("collective-objects", "Objects", "/objects", "Form follows feeling.", "A small universe of lighting and furniture, made with intention and made to be lived with.", [
      gallery("objects-edit", "The permanent collection", ["Arc — sculptural brass lighting", "Ravelin — precise pendant geometry", "Solace — quiet materiality"]),
      paragraph("objects-sourcing", "What we make matters. How we make it matters more.", "We favour repairable details, responsible material choices and transparent provenance."),
    ]),
    sitePage("collective-experiences", "Experiences", "/experiences", "Better together.", "Consultations, design workshops and thoughtful gatherings that turn ideas into shared experience.", [
      column("experience-types", "Join us", ["Private studio consultations", "Material and making workshops", "Product launches and gatherings"]),
      { id: "exp-form", type: "form", props: { title: "Request a private session", body: "Tell us what you have in mind. This is a local demonstration form, not a live booking.", items: ["Name", "Email", "Experience"], ctaLabel: "Prepare enquiry", formId: "nl-forms-901" } },
    ]),
    sitePage("collective-about", "Our Story", "/about", "Independence of thought. Unity of purpose.", "A multidisciplinary collective of makers, strategists, designers and operators.", [
      paragraph("about-note", "A house of ideas.", "Three distinct businesses share a commitment to craft, clarity and hospitality. Our team moves between strategy and execution without losing the details that make the work personal."),
      column("about-values", "Principles", ["Curiosity before certainty", "Material honesty", "Enduring usefulness"]),
    ]),
    sitePage("collective-contact", "Contact", "/contact", "Let's make something matter.", "Start with the ambition, the constraint or the question. Good work begins with a conversation.", [
      { id: "contact-brief", type: "form", props: { title: "Tell us about your project", body: "Sample input only; Arlovi does not send messages until a provider is connected.", items: ["Name", "Email", "Project type", "Budget", "Brief"], ctaLabel: "Prepare project brief", formId: "nl-forms-900" } },
    ]),
  ],
  nav: {
    header: [
      { id: "n-work", label: "Work", target: "/work", kind: "page", children: [] },
      { id: "n-atelier", label: "Atelier", target: "/atelier", kind: "page", children: [] },
      { id: "n-objects", label: "Objects", target: "/objects", kind: "page", children: [] },
      { id: "n-experiences", label: "Experiences", target: "/experiences", kind: "page", children: [] },
      { id: "n-about", label: "About", target: "/about", kind: "page", children: [] },
      { id: "n-contact", label: "Contact", target: "/contact", kind: "page", children: [] },
    ],
    footer: [{ id: "f-about", label: "About", target: "/about", kind: "page", children: [] }, { id: "f-contact", label: "Contact", target: "/contact", kind: "page", children: [] }],
    redirects: [],
  },
  components: [{
    id: "collective-editorial-hero", name: "Editorial hero / Collection", shared: true,
    variants: ["warm editorial", "monochrome", "objects"], usedOn: ["Home", "Atelier", "Objects"],
    blocks: [{ id: "shared-hero", type: "hero", props: { title: "Made for the way we live.", body: "Material. Space. Experience.", align: "start", tone: "plain", padding: "roomy" } }],
  }],
  cms: {
    collections: [
      { id: "projects", name: "Case Studies", slug: "work", fields: [
        { id: "title", name: "Title", type: "text", required: true, refCollection: "" },
        { id: "category", name: "Discipline", type: "text", required: true, refCollection: "" },
        { id: "story", name: "Story", type: "longtext", required: true, refCollection: "" },
      ] },
      { id: "objects", name: "Objects", slug: "objects", fields: [
        { id: "title", name: "Name", type: "text", required: true, refCollection: "" },
        { id: "story", name: "Material story", type: "longtext", required: true, refCollection: "" },
      ] },
    ],
    entries: [
      { id: "case-lighthouse", collectionId: "projects", title: "Lighthouse Hotels", status: "draft", values: { title: "Lighthouse Hotels", category: "Hospitality", story: "Light as architecture across 45 guest rooms. Concept through installation." } },
      { id: "case-morrow", collectionId: "projects", title: "Morrow House", status: "draft", values: { title: "Morrow House", category: "Residential", story: "A quieter kind of luxury through timber, texture and natural light." } },
      { id: "object-arc", collectionId: "objects", title: "Arc", status: "draft", values: { title: "Arc", story: "A deliberate curve in warm brass. Repairable components and lasting proportion." } },
    ],
  },
  forms: [
    { id: "brief", name: "Project brief", formRecordId: "nl-forms-900", fields: [{ id: "name", label: "Name", type: "text", required: true }, { id: "email", label: "Email", type: "email", required: true }], consent: "I agree to a reply about my enquiry.", honeypot: true, route: "record", webhook: "" },
  ],
  domains: [],
  deployments: [{ id: "showcase-preview", at: "2026-11-14T09:30:00.000Z", environment: "preview", state: "draft", note: "Concept and local draft only. No hosting or domain is connected.", pages: 7, bytes: 0, actor: "Maya Chen" }],
};
const form = (fields: unknown[], confirmation: string) => ({
  fields, logic: [],
  theme: { accent: PALETTE.acid, ink: PALETTE.ink, paper: PALETTE.canvas, radius: 0, width: "narrow", font: "Manrope" },
  settings: { notifyEnabled: false, notifyTo: "", confirmation, retentionDays: 180, access: "link", closed: false, closeMessage: "", version: 1 },
});
const move = (id: string, label: string, kind: string, fill: string, box: {x:number;y:number;w:number;h:number}, text?: string) => ({
  id, name: label, kind, visible: true, locked: false, box, fill, ...(text ? { text, textStyle: { family: "Manrope", size: kind === "text" ? 62 : 18, weight: 500, align: "start" } } : {}),
  tracks: { opacity: [{ id:id+"-a", t:0, value:0, easing: {kind:"bezier",points:[0.2,0,0,1]} }, {id:id+"-b",t:1.4,value:1,easing:{kind:"bezier",points:[0.2,0,0,1]}}] },
});
const deckLayout = (id:string) => LAYOUTS.find(l=>l.id===id) ?? LAYOUTS[0];
const slide = (layout:string, title:string, values:Record<string,string>,notes:string):Slide => ({
  ...slideFromLayout(deckLayout(layout),title),
  objects: slideFromLayout(deckLayout(layout),title).objects.map(o => o.type === "text" && o.text?.role && values[o.text.role] !== undefined ? { ...o, text:{...o.text,text:values[o.text.role]} } : o),
  notes,
});
const flagshipDeck:Deck = {
  theme: THEMES[0], themes: THEMES, layouts: LAYOUTS,
  slides: [
    slide("title","Material. Space. Experience.",{eyebrow:"NORTHLINE COLLECTIVE / 2027",title:"Material. Space. Experience.",subtitle:"An independent house of design, objects and experiences"},"Open with the philosophy, not an inventory of capabilities. Leave silence after the headline."),
    slide("twoColumn","The collective",{title:"Three disciplines. One perspective.",body:"ATELIER  /  considered spaces and illumination\nSUPPLY  /  objects built to outlast trends\nEXPERIENCES  /  meaningful human encounters",caption:"Editorial narrative, not a claim of external market performance."},"Introduce the shared principles and each business separately."),
    slide("statement","The thesis",{title:"The future is more human, not more complicated."},"Hold this line without filling the slide with extra copy."),
    slide("twoColumn","The opportunity",{title:"Lighthouse Hotels",body:"45 rooms. One cohesive lighting language.\nConcept, material specification, procurement and installation.\nIllustrative proposal: £185,000.",caption:"Illustrative fictional engagement; not an accepted contract."},"Describe the lifecycle from customer enquiry through final installation."),
    slide("twoColumn","Our process",{title:"From thought to built reality",body:"01 Observe\n02 Define\n03 Explore\n04 Test materials\n05 Make\n06 Evaluate",caption:"A collaborative, measurable practice."},"Connect the project lifecycle to underlying records, approvals and delivery milestones."),
    slide("statement","The closing thought",{title:"Good design creates room for life."},"Finish on the work and invite questions."),
  ],
  index:0, comments:[], approvals:[], exports:[], importNotes:[], reduceMotion:false,
};

registerSeed("flagship-collective", (ctx) => {
  const records:Rec[]=[];
  const id=(collection:string,n:number)=>ctx.id("nl",collection,BASE+n);
  const push=(collection:string,n:number,title:string,details: {
    status?:string;summary?:string;owner?:string;tags?:string[];fields?:Record<string,string|number|boolean>;body?:unknown;parentId?:string;amountMinor?:number;dueAt?:string
  }={}) => {
    records.push(ctx.rec({org:"nl",collection,n:BASE+n,title,...details,
      fields:{...details.fields,flagship:"Northline Collective",fictional:true},
      tags:["flagship",...(details.tags??[])]}));
  };
  push("brands",0,"Northline Collective — identity system",{summary:"Fictional flagship master identity: editorial restraint, exacting craft, warm modernism.",fields:{palette:JSON.stringify(PALETTE),positioning:"Material. Space. Experience.",website:id("sites",0)},body:{brands:BRANDS,palette:PALETTE,identity:NORTHLINE_COLLECTIVE_IDENTITY,typography:{display:"Manrope",accent:"Newsreader Italic",labels:"DM Mono",reading:"Georgia"},artDirection:"Tactile editorial material collage, paper slips, acid directional drawing, violet/blue/apricot paper, typographic contrasts, crisp thin rules and square panels. Original Northline artwork; no reference-brand assets."}});
  push("legalEntities",0,"Northline Collective — group concept",{status:"draft",summary:"Demonstration group profile only; not a registered legal entity.",fields:{entityType:"fictional_group",currency:"GBP",legalStatus:"simulation"}});
  ["Group Strategy","Design & Studio","Commerce & Distribution","Experiences & Hospitality","Finance & Governance","Technology & Digital","Marketing & Growth","People & Operations"].forEach((name,i)=>push("departments",i,name,{summary:"Flagship organisational unit; representative staffing and responsibilities.",fields:{lead:["Maya Chen","Iris Bell","Jonah Adeyemi","Amara Diallo","Elena Voss","Leo Moreno","Priya Shah","Theo Marsh"][i],members:[8,18,16,9,9,8,8,6][i]}}));
  ["Manchester Creative Headquarters","London Design Showroom","Midlands Distribution Centre","Northline Experiences Studio"].forEach((name,i)=>push("locations",i,name,{summary:"Illustrative operational facility, not a real address.",fields:{kind:["office","showroom","warehouse","studio"][i],timezone:"Europe/London"}}));
  ["Northline Collective","Northline Atelier","Harbor Supply Studio","Northline Experiences"].forEach((name,i)=>push("companies",i,name,{summary:i===0?"Flagship parent brand concept":"Illustrative operating division within the flagship",fields:{kind:i===0?"group":"division",groupId:id("companies",0)}}));
  const goals=["Grow profitable recurring revenue","Protect on-time project completion","Make the studio portfolio internationally recognised","Improve responsible sourcing","Deliver a remarkable customer experience"];
  goals.forEach((title,i)=>push("objectives",i,title,{status:"active",summary:"Annual planning objective, illustrative.",fields:{target:[12000000,95,100,80,92][i],current:[9600000,88,28,61,87][i],measure:["GBP revenue","On-time %","Qualified global leads","Responsible supplier %","Customer satisfaction %"][i]}}));
  const products=["Arc Brass Floor Lamp","Ravelin Pendant","Solace Table Lamp","Morrow Oak Console","Contour Wall Light","Studio Materials Kit","Archive Linen Shade","Portside Reading Light"];
  products.forEach((name,i)=>push("products",i,name,{summary:"Thoughtfully designed catalogue item, demo only.",amountMinor:[98000,69000,42000,165000,31000,9500,18000,38500][i],fields:{sku:"NLC-"+String(i+1).padStart(3,"0"),stock:100+i*14,category:i<3?"Lighting":"Objects",retailPriceMinor:[98000,69000,42000,165000,31000,9500,18000,38500][i],status:"draft"}}));
  ["Lighthouse Hotels","Morrow House Developments","Stillwater Hospitality","Terrace Living","Juniper Architects","Cedar & Coast Retail"].forEach((name,i)=>{
    push("companies",10+i,name,{summary:"Fictional customer account.",fields:{segment:i%2===0?"hospitality":"trade",owner:"Priya Shah",source:"showcase"}});
    push("contacts",10+i,["Sofia Reed","Marcus Vale","Isla Moreno","Owen Price","Nia Shah","Elliot Moss"][i],{summary:"Representative fictional contact.",fields:{companyId:id("companies",10+i),email:"client"+(i+1)+"@example.invalid"}});
    push("deals",10+i,name+" — design opportunity",{status:i<2?"proposal":"qualified",amountMinor:[18500000,9400000,6300000,3500000,6200000,2500000][i],fields:{companyId:id("companies",10+i),contactId:id("contacts",10+i),stage:i<2?"proposal":"qualified",probability:35+i*5}});
  });
  push("projects",0,"Lighthouse Hotels — guest-room lighting",{status:"planning",summary:"45 rooms; architectural lighting concepts, procurement and installation. Fictional flagship journey.",amountMinor:18500000,fields:{companyId:id("companies",10),dealId:id("deals",10),budgetMinor:18500000,startDate:"2026-11-02",progress:14}});
  ["Discovery and site survey","Concept direction and material research","Room prototype and technical review","Client approval gate","Supplier procurement","Installation and handover"].forEach((title,i)=>push("tasks",i,"Lighthouse / "+title,{status:i===0?"done":i<3?"in_progress":"todo",summary:"Cross-application project milestone.",parentId:id("projects",0),fields:{projectId:id("projects",0),phase:i+1,owner:["Iris Bell","Sable Nguyen","Theo Marsh","Maya Chen","Theo Marsh","Iris Bell"][i]}}));
  push("quotes",0,"Lighthouse Hotels — lighting specification",{status:"draft",amountMinor:18500000,summary:"Illustrative quote; must be accepted before it becomes contracted revenue.",fields:{companyId:id("companies",10),dealId:id("deals",10),projectId:id("projects",0),currency:"GBP"}});
  push("contracts",0,"Lighthouse Hotels — draft agreement",{status:"draft",summary:"Contract draft requiring authorised legal and client review.",fields:{companyId:id("companies",10),projectId:id("projects",0),signed:false}});
  push("documents",0,"Lighthouse Hotels — creative brief",{status:"draft",summary:"Project purpose, scope, materials, room typologies and approvals.",fields:{projectId:id("projects",0),type:"creative_brief"},body:{content:"LIGHTHOUSE HOTELS\nA warm, architectural lighting language across 45 rooms.\nIntent: calm arrival, repairable fittings, tactile materials.\nStages: discovery, prototype, signoff, fabrication and installation.\nThe £185,000 value is illustrative and not recognised revenue."}});
  push("invoices",0,"Lighthouse — deposit invoice / DRAFT",{status:"draft",amountMinor:3700000,summary:"Unissued demonstration invoice. Not posted to the ledger and not paid.",fields:{companyId:id("companies",10),projectId:id("projects",0),paymentStatus:"not_sent",posted:false}});
  push("tickets",0,"Lighthouse — finish sample enquiry",{status:"open",summary:"Client would like to compare the blackened and brushed brass finishes.",fields:{companyId:id("companies",10),projectId:id("projects",0),priority:"normal"}});
  push("portals",0,"Lighthouse Hotels — client review portal",{status:"draft",summary:"Fictional scoped customer collaboration: approved brief, milestones, change requests and document review.",fields:{companyId:id("companies",10),projectId:id("projects",0),externalAccess:"not_connected"},body:{sections:["Overview","Approvals","Milestones","Documents","Messages"],sharedRecordIds:[id("documents",0),id("projects",0),id("quotes",0)]}});
  push("sites",0,"Northline Collective — flagship editorial site",{status:"draft",summary:"Seven-page art-directed branded website in the native builder. No live publication or provider connection.",fields:{delivery:"not_connected",pageCount:7,showcase:true},body:WEB_BODY});
  push("forms",0,"Northline Collective — immersive project brief",{status:"draft",summary:"Branded multi-step client intake, consent and project classification; local only.",fields:{category:"client_intake",websiteId:id("sites",0)},body:form([
    {id:"type",type:"select",label:"What are we creating together?",required:true,options:["A considered space","A collection of objects","A memorable experience","Something unexpected"]},
    {id:"name",type:"text",label:"Your name",required:true},
    {id:"email",type:"email",label:"Email address",required:true,pattern:"email"},
    {id:"intro",type:"pagebreak",label:"The story behind the project"},
    {id:"vision",type:"longtext",label:"What should this project make people feel?",required:true,maxLength:1500},
    {id:"budget",type:"select",label:"Indicative investment",required:true,options:["£5k–£25k","£25k–£100k","£100k–£250k","£250k+"]},
    {id:"consent",type:"checkbox",label:"I consent to being contacted about my enquiry",required:true}
  ],"Your project brief has been saved locally for this demonstration.")});
  push("forms",1,"Northline Experiences — private session",{status:"draft",summary:"Consultation and workshop enquiry form.",fields:{category:"booking_intake"},body:form([
    {id:"name",type:"text",label:"Your name",required:true},{id:"email",type:"email",label:"Email",required:true},
    {id:"experience",type:"select",label:"Choose an experience",required:true,options:["Design consultation","Material workshop","Private event"]},
    {id:"date",type:"date",label:"Preferred date",required:true},{id:"requirements",type:"longtext",label:"Anything that would make your visit easier?"}
  ],"Your session request is saved locally; no booking has been confirmed.")});
  push("campaigns",0,"Objects for Living — collection launch",{status:"draft",summary:"Integrated collection campaign across brand, product pages, film, social and editorial.",amountMinor:600000,fields:{objective:"Qualified design enquiries",budgetMinor:600000,spentMinor:0,approval:"draft",delivery:"not_connected"}});
  push("audiences",0,"Design-conscious hospitality and trade",{status:"draft",summary:"Fictional segmentation criteria; not an opted-in list.",fields:{consentRequired:true,source:"demo",sync:"not_connected"}});
  push("decks",0,"Northline Collective / Manifesto & Portfolio",{status:"draft",summary:"Six-slide art-directed conceptual deck with speaker notes. Editable in native Presentations.",fields:{slides:flagshipDeck.slides.length,folder:"Flagship",theme:"Editorial"},body:flagshipDeck});
  push("motions",0,"Collective identity — cinematic wordmark",{status:"draft",summary:"Five-second typography and tonal composition with accessible motion settings.",fields:{kind:"composition",fps:30,width:1440,height:810,duration:5},body:{
    version:2,width:1440,height:810,fps:30,duration:5,background:PALETTE.ink,loop:false,
    layers:[move("m1","Northline", "text",PALETTE.canvas,{x:120,y:275,w:1100,h:118},"NORTHLINE"),
      move("m2","Bronze rule","rect",PALETTE.acid,{x:120,y:452,w:360,h:8}),
      move("m3","Collective","text",PALETTE.paper,{x:120,y:490,w:900,h:100},"COLLECTIVE")],
    markers:[],presets:[],renders:[],reducedMotion:true,
  }});
  push("videos",0,"A Collection of Ways of Living — brand film",{status:"draft",summary:"60-second storyboard and editorial edit plan; footage is not rendered or uploaded.",fields:{kind:"sequence",fps:25,width:1920,height:1080,duration:60,provider:"not_connected"},body:{
    version:2,fps:25,width:1920,height:1080,duration:60,
    tracks:[{id:"picture",name:"Picture",kind:"video",order:1,muted:false,solo:false,locked:false,height:58}],
    clips:[],sources:[],markers:[{id:"beat-1",at:0,title:"01 / Material"},{id:"beat-2",at:15,title:"02 / Space"},{id:"beat-3",at:30,title:"03 / Experience"},{id:"beat-4",at:45,title:"04 / Collective"}],
    reviews:[],renders:[],loudnessTarget:-16,
    productionNotes:"Quiet opening: macro hands and material. Move to architecture, then the people inhabiting it. Sound-led edits, not generic stock montages. Photography requires original capture or appropriately licensed files. Closing title: Made for the way we live."
  }});
  push("assets",0,"Collective campaign art direction",{status:"draft",summary:"Art-direction specification, not a claimed generated photo.",fields:{kind:"brief",licence:"not_acquired",brandId:id("brands",0)},body:{palette:PALETTE,shots:["Brass in grazing morning light","A lived-in architectural interior","Hands selecting textured materials","Human-scale workshop moments"],avoid:["Synthetic glossy renders","Unlicensed stock","Fake production photos"]}});
  push("services",0,"Private spatial design consultation",{status:"draft",amountMinor:18000,summary:"Ninety-minute design consultation, subject to staff and availability.",fields:{durationMinutes:90,capacity:1,bookingState:"local_only"}});
  push("bookings",0,"Private consultation — sample request",{status:"requested",summary:"Fictional sample; no booking or payment confirmation sent.",fields:{serviceId:id("services",0),paymentState:"not_connected"}});
  push("suppliers",0,"Studio Metals — sample supplier",{status:"prospect",summary:"Fictional supplier under provenance review.",fields:{category:"fabrication",approved:false}});
  push("purchaseOrders",0,"Lighthouse — materials sourcing / DRAFT",{status:"draft",amountMinor:2640000,summary:"Unsent supplier purchasing plan; not a real commitment.",fields:{supplierId:id("suppliers",0),projectId:id("projects",0),externalState:"not_connected"}});
  push("risks",0,"Collection launch — image rights clearance",{status:"open",summary:"Editorial imagery requires original capture, consent and rights clearance before publication.",fields:{severity:"high",owner:"Iris Bell"}});
  push("approvals",0,"Lighthouse — concept signoff",{status:"pending",summary:"Awaiting authorised customer approval; no client access has been sent.",fields:{linkedId:id("projects",0),scope:"project_concept"}});
  push("missions",0,"Flagship creative direction — 2027",{status:"draft",summary:"Cross-functional demonstration mission; no autonomous execution authorised.",fields:{budgetMinor:0,committedMinor:0,spentMinor:0,executionPaused:true},body:{steps:["Agree master narrative","Design identity and catalogue","Review production assets and licensing","Prepare website","Quality assurance","Obtain approval before publication"]}});
  push("facts",0,"Collective positioning — approved concept",{status:"draft",summary:"Brand positioning is a fictional demo concept.",fields:{sourceId:id("documents",0),confidence:"illustrative"}});
  push("workflows",0,"Flagship project intake routing",{status:"draft",summary:"Form submission → CRM review → qualification → proposal; no external operations.",fields:{enabled:false,externalState:"not_connected"},body:{trigger:"new_local_submission",nodes:[{kind:"review",target:"CRM"},{kind:"task",target:"Sales"},{kind:"approval",target:"Owner"}]}});
  push("datasets",0,"Flagship cross-company operations model",{status:"draft",summary:"Metric definitions and sample business narrative; no synthetic posted financial transactions.",fields:{revenueTargetGBP:9600000,employeeTarget:82,aiEmployeeTarget:18,simulation:true}});
  push("appProjects",0,"Collective client specification portal",{status:"draft",summary:"Internal application concept for project approvals and installation tracking.",fields:{environment:"local",deployState:"not_connected"},body:{screens:["Project overview","Client signoff","Deliverables","Progress"],roles:["Client","Account manager","Project manager"]}});
  push("policies",0,"Flagship AI approvals and external actions",{status:"draft",summary:"No automated spending, publication, external communication or sensitive data access without scoped authorisation.",fields:{humanApprovalRequired:true,externalExecution:false}});
  push("incidents",0,"Showcase hosting connection unavailable",{status:"open",summary:"Live publishing is intentionally blocked until a hosting connector is configured.",fields:{severity:"low",provider:"hosting",capability:"not_connected"}});
  // Fill broader workflows with linked, non-financial records without presenting sample business volumes as verified facts.
  const linkedCollections=["emailThreads","meetings","notifications","templates","workbooks","publications","designs","photos","returns","warehouse","stockMoves","budgets","articles","sources","reviews","skills","agents","evaluations","channels","messages","shifts","leaveRequests","applicants","employees","receipts","obligations","datasets","workflowRuns","connectors","expenses","promotions","socialPosts","timelineEvents","resources"];
  linkedCollections.forEach((collection)=>{
    if(collection==="datasets")return;
    push(collection,0,"Collective / "+collection.replace(/([A-Z])/g," $1").toLowerCase()+" showcase",{status:"draft",summary:"Illustrative flagship record; additional specialist-specific records belong in the native editor.",fields:{sourceProjectId:id("projects",0),demoOnly:true}});
  });
  // Realistic roster size for the reference company, without exposing personal data.
  // Each member is fictional and starts with a scoped demonstration profile.
  const first=["Avery","Morgan","Samira","Theo","Priya","Elliot","Amara","Jonah","Harper","Nia","Iris","Owen","Elena","Felix","Maya","Sofia","Rowan","Leah","Rafael","Sable"];
  const last=["Bell","Chen","Shah","Moss","Moreno","Vale","Brooks","Reed","Lind","Patel","Hale","Bennett","Grant","Singh","Santos","Walker","Doyle","Nash","Ward","Foster"];
  const titles=["Interior Designer","Lighting Specialist","Product Designer","Creative Producer","Warehouse Associate","Account Manager","Customer Care Specialist","Marketing Executive","Studio Coordinator","Operations Analyst","Software Engineer","Finance Associate"];
  for(let i=1;i<=82;i++){
    const title=titles[(i-1)%titles.length];
    const name=first[(i-1)%first.length]+" "+last[(i*7)%last.length]+" "+String(i).padStart(2,"0");
    const departmentId=id("departments",(i-1)%8);
    push("employees",i,name,{status:i%19===0?"probation":"active",summary:"Fictional "+title+" in the flagship workforce.",fields:{
      title,departmentId,office:["Manchester Creative Headquarters","London Design Showroom","Midlands Distribution Centre","Experiences Studio"][i%4],
      employment:"full-time",payrollState:"demo_only",manager:"Maya Chen",hireDate:"2025-"+String((i%12)+1).padStart(2,"0")+"-01",
      salaryMinor:0,confidentiality:"fictional_no_personal_data"
    }});
    push("members",i,name,{summary:"Scoped fictional human member of the flagship.",fields:{kind:"human",role:"member",departmentId,title,employeeId:id("employees",i)}});
  }
  const specialistRoles=[
    "Chief of Staff","Sales Director","Financial Analyst","Marketing Strategist","Creative Producer","Customer Care Specialist",
    "Procurement Coordinator","People Operations Assistant","Project Coordinator","Data Analyst","Knowledge Steward","IT Reliability",
    "Digital Engineer","Content Editor","Photo Editor","Motion Designer","Legal Operations Assistant","Operations Coordinator"
  ];
  specialistRoles.forEach((role,i)=>{
    const n=i+1,dep=id("departments",i%8);
    push("agents",n,"Northline / "+role,{status:"draft",summary:"Fictional AI specialist. Contract configured for local demonstration; no provider connection or autonomous execution.",
      fields:{role,model:"not_connected",autonomy:i===0?"suggest":"draft",departmentId:dep,manager:"Maya Chen",
        spendCapMinor:0,recordedCostMinor:0,authority:"Read scoped records; draft proposals; request human approval",pausedReason:"No AI provider is connected"},
      body:{skills:["Scoped research","Drafting","Source citation","Approval handoff"],tools:[
        {id:"workspace.read",label:"Read authorised records",granted:true},
        {id:"workspace.draft",label:"Prepare local draft",granted:true},
        {id:"external.execute",label:"Perform external action",granted:false}],
        sources:[],authority:["No financial posting","No external sending","No live publication","No permissions escalation"],evaluated:false}
    });
    push("evaluations",n,""+role+" — activation evaluation",{status:"pending",summary:"Activation blocked until scoped scenarios and an independent reviewer sign off.",fields:{agentId:id("agents",n),passed:false}});
  });
  // Twelve non-posted KPI planning snapshots provide charts and year-over-year
  // narrative without generating counterfeit bank or accounting evidence.
  const baseline=[480000,510000,545000,575000,602000,615000,660000,690000,718000,725000,768000,812000];
  baseline.forEach((revenue,i)=>push("datasets",i+1,"2026 monthly planning / "+String(i+1).padStart(2,"0"),{
    status:"draft",summary:"Synthetic scenario, not actual ledger revenue; do not mix with posted financial KPIs.",
    fields:{period:"2026-"+String(i+1).padStart(2,"0"),scenarioRevenueGBP:revenue,scenarioGrossMarginPct:39+(i%6),scenarioOnly:true,source:"flagship_simulation"}
  }));
  // Connected portfolios: each project links to a fictional customer and a
  // handful of specific deliverables without inventing invoice settlements.
  const projectKinds=["Interior refresh","Lighting specification","Showroom concept","Editorial campaign","Website experience","Object collection","Hospitality wayfinding","Digital product"];
  for(let i=1;i<=48;i++){
    const customerId=id("companies",10+(i%6)), projectId=id("projects",i),name=projectKinds[i%projectKinds.length];
    push("projects",i,name+" / "+String(i).padStart(3,"0"),{status:i%8===0?"completed":i%5===0?"at_risk":"active",
      summary:"Fictional multidisciplinary case for operational workflows.",fields:{companyId:customerId,portfolio:"Flagship / Client delivery",
        progress:(i*17)%100,projectLead:first[i%first.length]+" "+last[i%last.length],approvalState:"local_only"}});
    for(let j=0;j<3;j++)push("tasks",i*3+j+5,name+" — "+["Discovery","Creative development","Review & handover"][j],{
      status:j===0?"done":j===1?"in_progress":"todo",parentId:projectId,fields:{projectId,phase:j+1}});
  }
  for(let i=1;i<=45;i++){
    push("suppliers",i,"Sample supplier "+String(i).padStart(2,"0"),{status:i%7===0?"review":"prospect",
      summary:"Fictional sourcing partner, no supplier account or payment connection.",fields:{category:["Materials","Fabrication","Packaging","Transport"][i%4],approved:false}});
  }
  for(let i=1;i<=65;i++){
    const productId=id("products",i%8);
    push("orders",i,"NLC demo order "+String(i).padStart(4,"0"),{status:i%9===0?"returned":i%4===0?"processing":"draft",
      summary:"Fictional sales-order lifecycle record. Not a confirmed external checkout or settlement.",
      amountMinor:42000+(i%7)*12500,fields:{productId,customerId:id("contacts",10+(i%6)),paymentState:"not_connected",
        fulfilmentState:i%4===0?"processing":"local_draft",externalOrder:false}});
    if(i<=30)push("tickets",i,"Order help / "+String(i).padStart(4,"0"),{status:i%3===0?"resolved":"open",
      summary:"Sample support case for an illustrative order.",fields:{orderId:id("orders",i),customerId:id("contacts",10+(i%6)),priority:i%7===0?"high":"normal"}});
  }
  for(let i=1;i<=24;i++)push("campaigns",i,"Editorial campaign / "+String(i).padStart(3,"0"),{
    status:i%6===0?"in_review":"draft",summary:"Fictional campaign brief; not published or sent.",
    fields:{objective:["Engagement","Lead quality","Collection discovery"][i%3],budgetMinor:50000+i*2500,spentMinor:0,
      approval:"draft",delivery:"not_connected"}
  });
  return {records,events:[{id:"evt-collective-flagship-900",organizationId:ctx.northline,at:ctx.now,actor:"flagship fixture",type:"showcase.created",message:"Northline Collective fictional flagship records loaded locally. No external publication, payment or communication occurred.",capability:"ready_local"}]};
});
