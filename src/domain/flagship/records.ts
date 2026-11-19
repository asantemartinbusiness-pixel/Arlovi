import type { Audit, Rec } from "@/domain/types";
import { ORG_COLLECTIVE, SEED_NOW } from "@/domain/types";

/**
 * Northline Collective is a standalone, explicitly fictional, browser-local
 * showcase tenant. IDs are stable and disjoint from the two legacy demo firms.
 * No provider sync, payment, payroll filing or AI execution is implied.
 */
export const FLAGSHIP_PREFIX = "nc";
export const flagshipId = (collection: string, n: number) =>
  `${FLAGSHIP_PREFIX}-${collection}-${String(n).padStart(4, "0")}`;

export type FlagshipMake = (collection: string, n: number, title: string, extra?: Partial<Rec>) => Rec;

const PEOPLE = ["Maya Chen", "Aisha Bennett", "Daniel Okoro", "Iris Okafor", "Theo Marsh", "Sofia Marín",
  "Zara Patel", "Olivia Brooks", "Kai Morgan", "Amara James", "Luca Rossi", "Freya Campbell",
  "Noah Williams", "Imani Clarke", "Ethan Davies", "Priya Shah", "Leila Mensah", "Ezra Cole",
  "Naomi Blake", "Oscar Reed", "Nia Okonkwo", "Hugo Laurent", "Elena Voss", "Talia Singh"];
const CLIENTS = ["Lighthouse Hotels", "Ridge & Vale Architects", "The Alder House", "Studio Meridian",
  "Solstice Hospitality", "Hearth & Form", "Henderson Interiors", "Crescent Living",
  "The Penrose Group", "Oriel Properties", "House of Field", "Evergreen Developments"];
const DEPARTMENTS = ["Leadership", "Finance", "Sales", "People", "Projects", "Customer Care",
  "Marketing", "Creative Studio", "Technology", "Procurement", "Operations"];
const CATEGORIES = ["Lighting", "Furniture", "Objects", "Textiles", "Accessories"];
const COLLECTIONS = ["Cove", "Forma", "Still", "Tide", "Arc", "Lumen", "Volume", "Atelier"];
const FINISHES = ["Brushed brass", "Oxidised bronze", "Warm white", "Smoked oak", "Bone linen", "Charcoal"];
const daysFrom = (now: string, offset: number) => new Date(Date.parse(now) + offset * 86_400_000).toISOString();

export function createFlagshipRecords(now: string = SEED_NOW): { records: Rec[]; events: Audit[] } {
  const records: Rec[] = [];
  const make: FlagshipMake = (collection, n, title, extra = {}) => ({
    id: flagshipId(collection, n), organizationId: ORG_COLLECTIVE,
    collection, title, status: extra.status ?? "active", ownerName: extra.ownerName ?? "Maya Chen",
    summary: extra.summary ?? "", amountMinor: extra.amountMinor, currency: "GBP",
    at: extra.at ?? now, dueAt: extra.dueAt, startAt: extra.startAt, endAt: extra.endAt,
    parentId: extra.parentId, tags: extra.tags ?? ["flagship", "fictional"],
    fields: { ...extra.fields, demo: true }, body: extra.body,
    createdAt: extra.createdAt ?? daysFrom(now, -210), updatedAt: extra.updatedAt ?? now,
    revision: 1, createdBy: extra.createdBy ?? "Northline Demo Studio",
    updatedBy: extra.updatedBy ?? "Northline Demo Studio", history: [],
  });
  const add = (collection: string, n: number, title: string, extra?: Partial<Rec>) =>
    records.push(make(collection, n, title, extra));

  records.push({
    ...make("organizations", 1, "Northline Collective", {
      summary: "Fictional Manchester-based group — Atelier, Harbor Supply and Experiences. Portfolio demonstration, not a live business.",
      fields: { slug: "collective", locale: "en-GB", timezone: "Europe/London", jurisdiction: "GB",
        legalName: "Northline Collective (fictional showcase)", brandAccent: "#A25237",
        executionPaused: false, demo: true, isFlagship: true },
      body: { positioning: "Spaces worth staying in.", nature: "fictional_showcase",
        divisions: ["Northline Atelier", "Harbor Supply", "Northline Experiences"],
        locations: ["Manchester Studio", "Ancoats Showroom", "Salford Fulfilment", "London Client Studio"],
        palette: { paper: "#F2EFE8", ink: "#252923", copper: "#A25237", sage: "#828B77", slate: "#53594F" } },
    }), id: ORG_COLLECTIVE,
  });

  ["Northline Atelier", "Harbor Supply", "Northline Experiences"].forEach((name, i) =>
    add("legalEntities", i + 1, name, { summary: "Fictional trading division in the Northline group.",
      fields: { groupId: ORG_COLLECTIVE, division: name, simulated: true, standaloneLegalEntityUnverified: true } }));
  DEPARTMENTS.forEach((name, i) => add("departments", i + 1, name, {
    summary: `${name} department · shared services and brand-specific workstreams`,
    fields: { lead: PEOPLE[i], headcount: [5,8,9,4,13,8,7,10,6,6,6][i], groupId: ORG_COLLECTIVE },
  }));
  ["Manchester Studio", "Ancoats Showroom", "Salford Fulfilment", "London Client Studio"].forEach((name, i) =>
    add("locations", i + 1, name, { fields: { city: i === 3 ? "London" : "Manchester", country: "United Kingdom",
      type: ["headquarters", "retail", "warehouse", "client_studio"][i] } }));
  ["Grow quality revenue", "Protect delivery commitments", "Deliver a coherent customer experience",
    "Improve product contribution", "Reduce avoidable manual work"].forEach((name, i) =>
    add("objectives", i + 1, name, { fields: { owner: PEOPLE[i], cycle: "2026-Q4",
      progress: [68, 82, 75, 57, 71][i] }, status: i === 3 ? "at_risk" : "active" }));

  for (let i = 1; i <= 82; i++) {
    const person = i <= PEOPLE.length ? PEOPLE[i - 1] : `${PEOPLE[(i * 7) % PEOPLE.length].split(" ")[0]} ${["Wells","Morgan","Price","Miller","Okoye","Davis","Hart","Bell","Foster","Rivera","Lee","Carter","Hughes","Ramos","Taylor","Rowe","Stone","Dixon","Kelly","Hale"][(i * 11) % 20]} ${String(i).padStart(2, "0")}`;
    const dept = DEPARTMENTS[(i - 1) % DEPARTMENTS.length];
    add("employees", i, person, { summary: `${dept} · member of the fictional group`, ownerName: "Elena Voss",
      status: i > 78 ? "onboarding" : "active",
      fields: { departmentId: flagshipId("departments", ((i - 1) % DEPARTMENTS.length) + 1),
        role: i === 1 ? "CEO" : i <= 11 ? "Department lead" : "Specialist",
        type: i % 7 ? "permanent" : "part_time", email: `colleague${i}@northline.example`,
        hireDate: daysFrom(now, -((i * 19) % 680)).slice(0, 10) },
    });
    if(i<=17) add("members",i,person,{fields:{role:i===1?"owner":i%5===0?"finance":"member",employeeId:flagshipId("employees",i),kind:"human"}});
  }
  for (let i = 1; i <= 25; i++) add("applicants", i, `Candidate ${String(i).padStart(2, "0")} · ${["Studio designer", "Service coordinator", "Account executive", "Warehouse operator"][i % 4]}`, {
    status: ["screening","interview","offer","rejected"][i%4],
    fields: { departmentId: flagshipId("departments", i%DEPARTMENTS.length+1), consentRecorded:true } });
  for (let i=1;i<=20;i++) {
    add("leaveRequests",i,`Annual leave · ${PEOPLE[i%PEOPLE.length]}`,{
      status:i%5===0?"pending":"approved",fields:{employeeId:flagshipId("employees",i+1),days:i%4+1}});
    add("shifts",i,`Studio rota · week ${i}`,{fields:{employeeId:flagshipId("employees",i+1),locationId:flagshipId("locations",i%4+1)}});
  }
  for(let i=1;i<=12;i++)add("payrollRuns",i,`Payroll · ${String(i).padStart(2,"0")}/2026`,{
    status:i===12?"draft":"approved",fields:{month:i,year:2026,provider:"not_connected",filed:false}});

  const accounts: [string,string,string][] = [
    ["1000","Operating bank","asset"],["1100","Trade receivables","asset"],["1200","Inventory","asset"],
    ["2000","Trade payables","liability"],["2100","VAT control","liability"],["3000","Equity","equity"],
    ["4000","Product revenue","revenue"],["4100","Design and services revenue","revenue"],
    ["5000","Cost of goods sold","expense"],["6000","Payroll expense","expense"],["6100","Premises and studio","expense"]
  ];
  accounts.forEach(([code,title,type],i)=>add("accounts",i+1,title,{fields:{code,type}}));
  const journal = (n:number,title:string,lines:{accountId:string;debitMinor:number;creditMinor:number}[],status="posted") =>
    add("journals",n,title,{status,amountMinor:lines.reduce((a,x)=>a+x.debitMinor,0),
      fields:{date:now.slice(0,10)},body:{date:now.slice(0,10),memo:title,lines}});
  journal(1,"Illustrative opening position",[
    {accountId:flagshipId("accounts",1),debitMinor:125_000_000,creditMinor:0},
    {accountId:flagshipId("accounts",3),debitMinor:25_000_000,creditMinor:0},
    {accountId:flagshipId("accounts",6),debitMinor:0,creditMinor:150_000_000},
  ]);
  journal(2,"Completed commercial design invoice",[
    {accountId:flagshipId("accounts",2),debitMinor:1_440_000,creditMinor:0},
    {accountId:flagshipId("accounts",8),debitMinor:0,creditMinor:1_200_000},
    {accountId:flagshipId("accounts",5),debitMinor:0,creditMinor:240_000},
  ]);
  for(let i=1;i<=180;i++)add("invoices",i,`NLC-INV-${String(2700+i).padStart(5,"0")}`,{
    status:i===2?"paid":i%13===0?"overdue":i%7===0?"draft":"awaiting_payment",
    amountMinor: (420+i%35*72)*100,
    parentId:flagshipId("contacts",(i%600)+1),
    fields:{number:`NLC-INV-${2700+i}`,contactId:flagshipId("contacts",(i%600)+1),
      netMinor:(350+i%35*60)*100,taxMinor:(70+i%35*12)*100,
      issuedAt:daysFrom(now,-(i%100)),paymentProvider:"not_connected"}});
  for(let i=1;i<=140;i++)add("bills",i,`Supplier bill NLC-B${String(i).padStart(4,"0")}`,{
    amountMinor:(250+i%40*140)*100,
    status:i%6===0?"inbox":i%7===0?"awaiting_approval":"approved",
    fields:{supplierId:flagshipId("suppliers",i%65+1),paidExternally:false}});
  for(let i=1;i<=24;i++)add("budgets",i,`${i<=12?"Operating":"Campaign"} budget · period ${i}`,{
    amountMinor:(i<=12?180_000:24_000)*100,fields:{period:`2026-${String((i-1)%12+1).padStart(2,"0")}`,owner:PEOPLE[i%PEOPLE.length]}});
  for(let i=1;i<=80;i++)add("bankTransactions",i,`Imported bank line ${String(i).padStart(4,"0")}`,{
    status:i%8===0?"unmatched":"matched",amountMinor:((i%9)-4)*12_000,
    fields:{source:"fictional_csv",matched:i%8!==0,bankAccountCode:"1000"}});
  for(let i=1;i<=60;i++)add("expenses",i,`Studio expense · ${["Materials","Courier","Travel","Catering","Software"][i%5]}`,{
    amountMinor:(35+i*9)*100,status:i%7===0?"review":"approved",
    fields:{category:["materials","delivery","travel","catering","software"][i%5]}});

  for(let i=1;i<=600;i++){
    const name=i<=CLIENTS.length?CLIENTS[i-1]:`${["Rowan","Marlow","Pavilion","Oak","Linden","Hearth","Alder","Moss","Wren","Larch","Kite","Ash"][i%12]} ${["Design","Living","Hotel","Studio","Interiors","Collective"][Math.floor(i/12)%6]} ${String(i).padStart(3,"0")}`;
    add("contacts",i,name,{status:i%53===0?"inactive":"active",summary:`${i%4?"Retail":"Trade"} relationship · example contact`,
      fields:{segment:i%4===0?"trade":"retail",email:`customer${i}@example.com`,
        consentMarketing:i%3===0,consentSource:i%3===0?"sample_opt_in":"none",
        city:["Manchester","London","Leeds","Birmingham","Bristol"][i%5],
        accountManager:PEOPLE[i%PEOPLE.length] }});
    if(i<=180)add("deals",i,`${name} · ${["Specification","Fit-out","Wholesale","Consultation"][i%4]}`,{
      status:["qualified","proposal","negotiation","won","lost"][i%5],
      amountMinor:((i%9)+1)*180_000, parentId:flagshipId("contacts",i),
      fields:{contactId:flagshipId("contacts",i),stage:["qualified","proposal","negotiation","won","lost"][i%5],
        probability:[25,40,65,100,0][i%5],owner:PEOPLE[i%PEOPLE.length] }});
    if(i<=120)add("leads",i,`Incoming enquiry · ${name}`,{
      status:i%4===0?"converted":"new",fields:{contactId:flagshipId("contacts",i),source:["website","referral","showroom","event"][i%4]}});
    if(i<=90)add("quotes",i,`NLC-Q-${String(i).padStart(4,"0")} · ${name}`,{
      amountMinor:((i%12)+1)*42_000,status:i%5===0?"accepted":"draft",
      fields:{contactId:flagshipId("contacts",i),dealId:flagshipId("deals",i),approved:i%5===0}});
    if(i<=100)add("companies",i,name,{fields:{contactId:flagshipId("contacts",i),segment:"business"}});
  }

  for(let i=1;i<=350;i++){
    const category=CATEGORIES[(i-1)%CATEGORIES.length], collection=COLLECTIONS[Math.floor((i-1)/CATEGORIES.length)%COLLECTIONS.length];
    const finish=FINISHES[i%FINISHES.length], sku=`NC-${category.slice(0,3).toUpperCase()}-${String(i).padStart(4,"0")}`;
    const cost= (45+i%25*12)*100,price=(120+i%40*24)*100;
    add("products",i,`${collection} ${category.slice(0,-1)||category} · ${finish}`,{
      status:i%31===0?"draft":"active",amountMinor:price,
      summary:`${collection} collection. Material-led, quietly sculptural objects for contemporary spaces.`,
      fields:{sku,taxCategory:"standard",unitCostMinor:cost,productCollection:category,
        published:i%31!==0,reorderPoint:8,reorderQuantity:24,leadTimeDays:14+(i%4)*7,
        stockQuantity:8+(i*7)%42,brand:"Harbor Supply"},
      body:{description:"Considered proportions, enduring finishes and careful material selection.",
        variants:[{id:`${sku}-v1`,name:finish,sku,priceDeltaMinor:0}],
        options:[{name:"Finish",values:[finish]}],media:[]},
    });
  }
  for(let i=1;i<=1200;i++){
    const p=(i%350)+1,c=(i%600)+1,qty=i%4+1,price=(120+p%40*24)*100;
    add("orders",i,`NC-${String(40000+i)}`,{status:i%29===0?"returned":i%13===0?"processing":"fulfilled",
      amountMinor:price*qty,parentId:flagshipId("contacts",c),
      fields:{number:`NC-${40000+i}`,contactId:flagshipId("contacts",c),
        fulfilment:i%13===0?"processing":"fulfilled",payment:"not_connected",
        channel:i%4===0?"showroom":"storefront",warehouseId:flagshipId("warehouses",1),
        netMinor:price*qty,shippingMinor:0,taxMinor:0},
      body:{lines:[{id:`ln-${i}`,productId:flagshipId("products",p),description:"Northline product",
        quantity:qty,unitPriceMinor:price,taxCategory:"standard"}],timeline:[]},
    });
    if(i<=120)add("returns",i,`Return request NC-R${i}`,{status:i%3===0?"pending":"resolved",
      fields:{orderId:flagshipId("orders",i*7),reason:["Damage","Incorrect finish","Change of mind"][i%3],
        refundStatus:"not_connected"}});
  }

  for(let i=1;i<=65;i++)add("suppliers",i,`Supplier ${["Formworks","Material House","Foundry","Textile Studio","Workshop"][i%5]} ${i}`,{
    fields:{email:`supplier${i}@example.com`,category:CATEGORIES[i%5],leadTimeDays:7+i%28,currency:"GBP"}});
  add("warehouses",1,"Salford Fulfilment",{fields:{code:"SAL",capacityUnits:8000,bins:120,managerName:"Theo Marsh"}});
  add("warehouses",2,"Ancoats Showroom",{fields:{code:"ANC",capacityUnits:450,bins:18,managerName:"Aisha Bennett"}});
  for(let i=1;i<=110;i++)add("purchaseOrders",i,`PO-NLC-${String(i).padStart(4,"0")}`,{
    status:i%7===0?"pending_approval":i%5===0?"received":"approved",
    amountMinor:(1_500+i*42)*100,
    fields:{supplierId:flagshipId("suppliers",i%65+1),warehouseId:flagshipId("warehouses",i%2+1),
      provider:"not_connected",received:i%5===0}});
  for(let i=1;i<=350;i++)add("stockMoves",i,`Opening count · ${COLLECTIONS[i%8]} ${i}`,{
    status:"posted",fields:{productId:flagshipId("products",i),warehouseId:flagshipId("warehouses",i%2+1),
      quantity:8+(i*7)%42,kind:"count",reference:"NLC-DEMO-STOCK"}});
  for(let i=1;i<=75;i++)add("projects",i,i===1?"Lighthouse Hotels — 45 room refurbishment":
    `${CLIENTS[i%CLIENTS.length]} · ${["Interior programme","Lighting specification","Creative launch","Digital experience"][i%4]}`,{
    status:i%11===0?"at_risk":i%5===0?"completed":"active",
    amountMinor:i===1?18_500_000:((i%12)+1)*360_000,
    fields:{clientId:flagshipId("contacts",i%600+1),
      lead:PEOPLE[i%PEOPLE.length],phase:["discovery","concept","delivery","review"][i%4],
      startDate:daysFrom(now,-(i*7)%180),endDate:daysFrom(now,((i*11)%130)+14)}});
  for(let i=1;i<=600;i++)add("tasks",i,`${["Review materials","Prepare specification","Confirm supplier","Send approval pack","Check installation","Client review"][i%6]} · ${String(i).padStart(3,"0")}`,{
    status:i%17===0?"blocked":i%4===0?"completed":"in_progress",
    parentId:flagshipId("projects",i%75+1),dueAt:daysFrom(now,(i%60)-20),
    fields:{projectId:flagshipId("projects",i%75+1),assignee:PEOPLE[i%PEOPLE.length],
      priority:i%9===0?"high":"normal"}});
  for(let i=1;i<=280;i++)add("tickets",i,`Case NLC-${String(i).padStart(5,"0")} · ${["Delivery enquiry","Finish query","Warranty claim","Return review","Installation support"][i%5]}`,{
    status:i%7===0?"open":i%11===0?"escalated":"resolved",
    parentId:flagshipId("contacts",i%600+1),fields:{contactId:flagshipId("contacts",i%600+1),
      orderId:flagshipId("orders",i+5),slaId:flagshipId("slas",1),
      priority:i%13===0?"urgent":"normal",channel:i%3===0?"email":"portal"}});
  add("slas",1,"Northline Customer Promise",{fields:{firstResponseHours:4,resolutionHours:48}});
  for(let i=1;i<=18;i++)add("articles",i,`Care guide · ${["Finishes","Delivery","Returns","Installation","Warranty","Trade ordering"][i%6]}`,{
    status:"published",body:{content:"Only approved guidance may be used for customer replies. External sending requires a connected provider."}});
  for(let i=1;i<=24;i++)add("services",i,`${["Design discovery","Materials workshop","Showroom appointment","Professional masterclass"][i%4]} · ${i}`,{
    amountMinor:(90+i%6*25)*100,fields:{durationMinutes:30+i%4*30,capacity:i%4+1,requiresDeposit:i%3===0}});
  for(let i=1;i<=130;i++)add("bookings",i,`Session NLC-BK-${i}`,{
    status:i%19===0?"cancelled":i%7===0?"completed":"confirmed",
    parentId:flagshipId("contacts",i%600+1),startAt:daysFrom(now,(i%65)-12),
    fields:{serviceId:flagshipId("services",i%24+1),contactId:flagshipId("contacts",i%600+1),
      resourceId:flagshipId("resources",i%6+1),paymentStatus:"not_connected"}});
  for(let i=1;i<=6;i++)add("resources",i,`Consultation space / specialist ${i}`,{fields:{capacity:2,locationId:flagshipId("locations",i%4+1)}});

  for(let i=1;i<=40;i++)add("campaigns",i,`${["Objects in Light","Rooms with Purpose","The Material Edit","The Quiet Collection"][i%4]} · ${String(i).padStart(2,"0")}`,{
    status:i%6===0?"in_review":i%5===0?"completed":"draft",
    amountMinor:(800+i*95)*100,
    fields:{channel:i%3===0?"email":i%3===1?"social":"paid",
      assetId:flagshipId("assets",i%28+1),owner:"Sofia Marín",spendApproved:false,
      publishedExternally:false}});
  for(let i=1;i<=12;i++)add("audiences",i,`Audience · ${["Trade partners","Residential","Hospitality","Repeat customers"][i%4]}`,{
    fields:{consentRequired:true,source:"sample_opt_in",members:i*25}});
  for(let i=1;i<=40;i++)add("socialPosts",i,`Editorial post · story ${i}`,{
    status:i%4===0?"approved":"draft",fields:{campaignId:flagshipId("campaigns",i),publishState:"not_connected"}});

  for(let i=1;i<=10;i++)add("channels",i,`${DEPARTMENTS[i]} · team updates`,{fields:{visibility:"internal"}});
  for(let i=1;i<=90;i++)add("emailThreads",i,`Correspondence · ${CLIENTS[i%CLIENTS.length]}`,{
    status:i%8===0?"needs_reply":"reviewed",fields:{contactId:flagshipId("contacts",i),
      provider:"not_connected",outboundVerified:false}});
  for(let i=1;i<=80;i++)add("meetings",i,`${["Client design review","Pipeline standup","Production planning","Leadership review"][i%4]} ${i}`,{
    startAt:daysFrom(now,(i%50)-10),fields:{projectId:flagshipId("projects",i%75+1),
      channel:"internal",externalCalendar:"not_connected"}});
  for(let i=1;i<=20;i++)add("portals",i,`${CLIENTS[i%CLIENTS.length]} · client space`,{
    fields:{contactId:flagshipId("contacts",i%600+1),
      projectId:flagshipId("projects",i%75+1),access:"invitation_required",
      publishedExternally:false},body:{sections:["Overview","Approvals","Documents","Milestones","Messages"]}});

  const roles=["Chief of Staff","Sales Director","Financial Analyst","Marketing Strategist",
    "Creative Producer","Customer Care Specialist","Procurement Coordinator","People Operations",
    "Project Coordinator","Data Analyst","Knowledge Steward","IT Reliability","Digital Engineer",
    "Content Editor","Visual Designer","Motion Producer","Legal Coordinator","Operations Planner"];
  roles.forEach((role,i)=>add("agents",i+1,`NLC · ${role}`,{
    status:i===11?"paused":"draft",
    summary:`Fictional ${role} agent profile. No model connected, no execution performed.`,
    fields:{role,departmentId:flagshipId("departments",i%11+1),
      model:"not_connected",autonomy:i<3?"act_with_approval":"draft",
      recordedCostMinor:0,spendCapMinor:0,externalActionsEnabled:false},
    body:{skills:[flagshipId("skills",i+1)],authority:["Read designated sample records","Draft local recommendations"],
      tools:[{id:"workspace.read",granted:true},{id:"email.send",granted:false}],
      evaluationStatus:"unverified"}}));
  roles.forEach((role,i)=>add("skills",i+1,`Playbook · ${role}`,{
    fields:{origin:"organization",version:"1.0-demo",trusted:false},
    body:{inputs:["Approved company knowledge"],outputs:["Draft local artifact"],tools:["workspace.read"]}}));
  for(let i=1;i<=18;i++)add("evaluations",i,`Evaluation · ${roles[i-1]}`,{
    status:"not_run",fields:{agentId:flagshipId("agents",i),verified:false}});

  for(let i=1;i<=30;i++)add("workflows",i,`Workflow · ${["Lead qualification","Stock threshold","Approval routing","Client onboarding","Booking reminder","Incident escalation"][i%6]}`,{
    status:i%5===0?"paused":"draft",fields:{trigger:["record_created","threshold","approval","schedule"][i%4],
      connected:false,externalSideEffects:false}});
  for(let i=1;i<=12;i++)add("workflowRuns",i,`Simulation trace ${i}`,{
    status:"simulated",fields:{workflowId:flagshipId("workflows",i),externalExecution:false}});
  for(let i=1;i<=16;i++)add("missions",i,`Mission · ${["Revenue recovery","Launch the collection","Reduce delivery delays","Improve service clarity"][i%4]}`,{
    status:i%5===0?"awaiting_approval":"planned",fields:{owner:"Maya Chen",agentId:flagshipId("agents",i%18+1),
      proposedBudgetMinor:45_000,authority:"approval_required",verifiedExecution:false}});
  for(let i=1;i<=30;i++)add("notifications",i,`${["Approval requested","Customer priority","Stock alert","Mission for review"][i%4]} · ${i}`,{
    status:i%4===0?"unread":"read",fields:{priority:i%7===0?"urgent":"normal",resolved:i%4!==0}});
  for(let i=1;i<=16;i++)add("approvals",i,`Review request · ${["Supplier PO","Campaign budget","Project change","AI mission"][i%4]}`,{
    status:i%3===0?"approved":"pending",fields:{requester:PEOPLE[i%PEOPLE.length],
      amountMinor:12_000+i*700,requiresHuman:true}});
  for(let i=1;i<=25;i++)add("sources",i,`Company source · ${["Brand book","Materials register","Supplier terms","Studio practice","Product specs"][i%5]} ${i}`,{
    fields:{provenance:"synthetic_demo",approved:i%4!==0}});
  for(let i=1;i<=35;i++)add("facts",i,`Knowledge fact ${i} · ${["Lead times","Pricing","Materials","Service promise"][i%4]}`,{
    status:i%6===0?"conflicted":"approved",
    fields:{sourceId:flagshipId("sources",i%25+1),confidence:0.83,verifiedExternally:false}});
  for(let i=1;i<=15;i++)add("decisions",i,`Operating decision · ${i}`,{
    fields:{sourceId:flagshipId("sources",i%25+1),approver:"Maya Chen"}});
  for(let i=1;i<=20;i++)add("datasets",i,`Analytics · ${["Sales conversion","Gross margin","Fulfilment velocity","Project capacity"][i%4]}`,{
    fields:{source:"browser_local_demo",freshness:now,unverifiedExternal:true}});
  for(let i=1;i<=20;i++)add("contracts",i,`Contract · ${CLIENTS[i%CLIENTS.length]}`,{
    status:i%5===0?"in_review":"active",
    fields:{contactId:flagshipId("contacts",i%600+1),requiresCounsel:i%6===0}});
  for(let i=1;i<=14;i++)add("risks",i,`Risk · ${["Late supplier","Project margin","Customer privacy","External provider"][i%4]}`,{
    status:i%3===0?"mitigating":"open",fields:{severity:i%5===0?"high":"medium"}});
  for(let i=1;i<=16;i++)add("obligations",i,`Obligation · ${i}`,{
    fields:{contractId:flagshipId("contracts",i),dueAt:daysFrom(now,i*5)}});
  for(let i=1;i<=14;i++)add("policies",i,`Policy · ${["Expenses","Human review","Information security","Returns","Brand licensing","Supplier conduct","Data retention"][i%7]}`,{
    status:"approved",fields:{reviewDate:daysFrom(now,90).slice(0,10)}});
  for(let i=1;i<=18;i++)add("connectors",i,`Connection · ${["Email","Calendar","Banking","Payments","Warehouse","Marketing"][i%6]} ${i}`,{
    status:"not_connected",fields:{provider:"not_connected",authorized:false,lastSyncVerified:false}});
  for(let i=1;i<=16;i++)add("incidents",i,`IT case · ${["Connector offline","Access review","Performance review","Delivery queue"][i%4]}`,{
    status:i%4===0?"open":"resolved",fields:{source:"fictional",provider:"not_connected",severity:i%4===0?"high":"low"}});
  for(let i=1;i<=20;i++)add("timelineEvents",i,`Company milestone ${i}`,{
    fields:{projectId:flagshipId("projects",i%75+1),kind:"milestone"}});

  const events: Audit[] = [{
    id:"evt-nc-flagship-ready",organizationId:ORG_COLLECTIVE,at:now,actor:"Northline Demo Studio",
    type:"flagship.fixture_loaded",message:"Fictional flagship records inserted locally; no external provider or AI execution occurred.",
    capability:"ready_local",
  }];
  return {records,events};
}
