import type { Rec } from "@/domain/types";
import type { FlagshipMake } from "./records";
import { flagshipId as id } from "./records";

const INK = "#252923";
const PAPER = "#F2EFE8";
const COPPER = "#A25237";
const SAGE = "#828B77";
const MONO = "#E5E0D5";
const LINES = [
  "Spaces worth staying in.", "The art of feeling at home.",
  "Material first. Feeling always.", "A quieter kind of extraordinary.",
];

const block = (key: string, type: string, title: string, body = "", extra: Record<string, unknown> = {}) =>
  ({ id: key, type, props: { title, body, align: "start", tone: "plain", padding: "roomy", columns: 3,
    items: [], plans: [], alt: "", ctaLabel: "", ctaTarget: "", formId: "", ...extra } });
const page = (name: string, path: string, hero: string, subtitle: string, blocks: ReturnType<typeof block>[]) =>
  ({ id: `page-${path.replaceAll("/", "-") || "home"}`, name, path, status: "published",
    seo: { title: `${name} — Northline Collective`,
      description: subtitle, noindex: false },
    blocks: [block(`hero-${name}`,"hero",hero,subtitle,
      { tone:"accent",padding:"roomy",ctaLabel:"Start a conversation",ctaTarget:"/contact" }), ...blocks,
      block(`footer-${name}`,"footer","Northline Collective",
        "A fictional creative and commerce group. Made to demonstrate Arlovi's connected studio and business experience.",
        { tone:"soft",padding:"normal",items:["Atelier","Harbor Supply","Experiences","Privacy"] })] });
const theme = {font:"Source Serif",accent:COPPER,ink:INK,paper:PAPER,radius:0,scale:107};

function siteModel() {
  const pages = [
    page("Home","/","Spaces worth staying in.","Independent brands, one point of view. A collective for spaces, objects and experiences with lasting character.",[
      block("home-manifesto","text","Beauty is useful.","We work where design meets everyday life. From the outline of a lamp to the atmosphere of a room, the best things make you want to stay."),
      block("home-divisions","columns","Three distinct practices","A shared idea, expressed in different ways.",{
        columns:3,items:["ATELIER — Interior, spatial and lighting design","HARBOR SUPPLY — Furniture, lighting and useful objects","EXPERIENCES — Private consultations and gatherings"]}),
      block("home-work","gallery","Selected works","A considered edit of environments and objects.",{
        items:["Lighthouse — a hospitality world built around calm","Cove — a study in light, shade and weight",
          "The Alder House — the poetry of familiar materials"],columns:3,
        alt:"Editorial artwork describing three fictional Northline projects"}),
      block("home-approach","text","A long view, not a quick trend.","Quiet craftsmanship, restless curiosity and the belief that useful things can be beautiful."),
    ]),
    page("Atelier","/atelier","Spaces with a point of view.","Interior architecture, lighting and visual worlds for the places people return to.",[
      block("atelier-what","columns","The practice","Made for a real life, not a render.",{
        items:["Interior and spatial design","Lighting specification and installation","Hospitality and residential concepts"],columns:3}),
      block("atelier-work","gallery","The portfolio","A collection of purposeful spaces.",{
        items:["Lighthouse Hotels · 45 rooms of considered warmth","Ridge & Vale · an urban sanctuary",
          "The Alder House · material language and restraint"],columns:3,
        alt:"Illustrated project studies in architecture and interiors"}),
      block("atelier-process","text","From first conversation to final object.","Discovery, material research, narrative, prototypes, delivery and aftercare—all held together in one project."),
    ]),
    page("Objects","/objects","Objects with intention.","The Harbor Supply collection. Material-rich lighting, furniture and everyday forms.",[
      block("objects-gallery","gallery","The collection","An honest material palette and sculptural forms.",{
        items:["Cove pendant · brushed brass","Forma table lamp · oxidised bronze","Still stool · smoked oak"],columns:3,
        alt:"Three rendered concept objects from the Harbor Supply collection"}),
      block("objects-details","pricing","Trade and residential","Illustrative prices, not a live checkout.",{
        plans:[{name:"Cove pendant",price:"From £480",note:"Concept price"},
          {name:"Forma table lamp",price:"From £360",note:"Concept price"},
          {name:"Still stool",price:"From £640",note:"Concept price"}]}),
      block("objects-service","text","Considered beyond the purchase.","Sampling, project quantities, specification guidance and caring for the material as it ages."),
    ]),
    page("Experiences","/experiences","Come closer.","Meet the work, feel the materials, and make space for new ideas.",[
      block("exp-programme","columns","The programme","An invitation to participate.",{
        items:["Private design consultations","Material and object workshops","Conversations with makers"],columns:3}),
      block("exp-form","form","Request a visit","A local demonstration form: requests are not sent until a provider is connected.",{
        items:["Your name","Email","What brings you here?"],formId:id("forms",2),
        ctaLabel:"Request a consultation"}),
    ]),
    page("Journal","/journal","Notes on living well.","An ongoing conversation about places, craft, movement and material.",[
      block("journal-grid","gallery","Field notes","Stories from a fictional studio.",{
        items:["01 / The quality of a shadow","02 / Objects that grow into their rooms",
          "03 / A more thoughtful hospitality","04 / Drawing with daylight"],columns:2,
        alt:"Editorial journal story cards"}),
    ]),
    page("Contact","/contact","Tell us what you imagine.","A new room, a well-made object, a shared experience. Every good project starts here.",[
      block("contact-form","form","Start a conversation","An editable, multi-step enquiry for the studio.",{
        items:["Your name","Email","What are you planning?"],formId:id("forms",1),
        ctaLabel:"Send a project enquiry"}),
      block("contact-note","text","Manchester · London","We work across the UK. This is a fictional showcase business; no message is actually sent."),
    ]),
  ];
  return {
    theme,seo:{siteTitle:"Northline Collective — spaces worth staying in",
      description:"Architecture, design-led objects and experiences. A fictional flagship portfolio in Arlovi.",
      robots:"noindex",sitemap:false},
    analytics:{consent:"not_asked"},
    pages,
    nav:{header:[["Home","/"],["Atelier","/atelier"],["Objects","/objects"],["Experiences","/experiences"],
      ["Journal","/journal"],["Contact","/contact"]].map(([label,target],i)=>({
        id:`nav-${i}`,label,target,kind:"page",children:[]})),
      footer:[{id:"foot-privacy",label:"Privacy",target:"/contact",kind:"page",children:[]}],redirects:[]},
    components:[{id:"nc-shared-footer",name:"Collective footer",shared:true,variants:["light","dark"],
      usedOn:pages.map(p=>p.name),blocks:[block("footer-master","footer","Northline Collective","Spaces worth staying in.")]}],
    cms:{collections:[{id:"nc-case-studies",name:"Case studies",slug:"work",
      fields:[{id:"case-title",name:"Title",type:"text",required:true,refCollection:""},
        {id:"case-detail",name:"Narrative",type:"longtext",required:true,refCollection:""},
        {id:"case-year",name:"Year",type:"number",required:true,refCollection:""}]},
      {id:"nc-objects",name:"Objects",slug:"objects",
        fields:[{id:"obj-title",name:"Title",type:"text",required:true,refCollection:""},
          {id:"obj-material",name:"Material",type:"text",required:true,refCollection:""}]}],
      entries:[
        {id:"entry-lighthouse",collectionId:"nc-case-studies",title:"Lighthouse Hotels",
          status:"published",values:{"case-title":"Lighthouse Hotels",
            "case-detail":"A quieter rhythm for 45 guest rooms.", "case-year":"2026"}},
        {id:"entry-alder",collectionId:"nc-case-studies",title:"The Alder House",
          status:"published",values:{"case-title":"The Alder House",
            "case-detail":"A domestic language of oak, limestone and soft light.", "case-year":"2026"}},
        {id:"entry-cove",collectionId:"nc-objects",title:"Cove pendant",
          status:"published",values:{"obj-title":"Cove pendant","obj-material":"Brushed brass and linen"}},
      ]},
    forms:[{id:"nc-site-enquiry",name:"Project enquiry",formRecordId:id("forms",1),
      fields:[{id:"name",label:"Name",type:"text",required:true},
        {id:"email",label:"Email",type:"email",required:true},
        {id:"project",label:"Project",type:"text",required:true}],
      consent:"The sample workspace only stores this locally.",honeypot:true,route:"review",webhook:""}],
    domains:[{id:"nc-domain",host:"northline-collective.example",primary:true,verified:false,dns:[]}],
    deployments:[{id:"nc-preview",at:"2026-11-18T16:00:00Z",environment:"preview",
      state:"not_connected",note:"Site model is editable locally. Hosting and custom domain are not connected.",
      pages:6,bytes:0,actor:"Northline Demo Studio"}],
  };
}

const field=(id:string,type:string,label:string,required=false,extra:Record<string,unknown>={})=>({
  id,type,label,required,help:"",options:[],placeholder:"",sensitive:false,...extra});
function formModel(kind:"project"|"visit"|"trade"){
  const fields=kind==="project"?[
    field("section-intro","section","Tell us about yourself"),
    field("full-name","text","Your name",true,{minLength:2}),
    field("contact-email","email","Email address",true,{pattern:"email"}),
    field("project-type","select","What are you imagining?",true,{options:["Residential interior","Hospitality","Brand environment","Product collaboration","Something else"]}),
    field("project-other","longtext","Tell us more",true,{maxLength:1200}),
    field("section-scope","section","About the project"),
    field("location","text","Where is the project?",true),
    field("budget","select","Indicative investment",false,{options:["£5k–£20k","£20k–£80k","£80k–£250k","£250k+"]}),
    field("timeline","select","Ideal start",true,{options:["Within three months","Three to six months","Later / exploring"]}),
    field("details","longtext","What should this feel like?",true,{maxLength:2000}),
    field("agree","checkbox","I understand this is a fictional sample form.",true),
  ]:kind==="visit"?[
    field("name","text","Your name",true),field("email","email","Email",true,{pattern:"email"}),
    field("reason","select","What would you like to do?",true,
      {options:["Private consultation","Showroom appointment","Workshop","Product demonstration"]}),
    field("participants","number","How many people?",true,{min:1,max:10}),
    field("access","longtext","Access or accessibility requirements",false,{sensitive:true}),
    field("date","date","Preferred date",true),
  ]:[
    field("company","text","Business name",true),field("contact","text","Main contact",true),
    field("email","email","Business email",true,{pattern:"email"}),
    field("sector","select","Your sector",true,{options:["Interior design","Architecture","Hospitality","Retail","Other"]}),
    field("volume","select","Indicative annual purchasing",true,{options:["Under £10k","£10k–£50k","£50k+"]}),
    field("notes","longtext","Tell us about the work",false),
  ];
  // Avoid saving enquiries to live providers in the flagship demo.
  return {fields,logic:kind==="project"?[
    {id:"other",targetId:"project-other",action:"show",whenFieldId:"project-type",operator:"equals",value:"Something else"}
  ]:kind==="visit"?[
    {id:"access",targetId:"access",action:"show",whenFieldId:"participants",operator:"greater_than",value:"1"}
  ]:[],theme:{accent:COPPER,ink:INK,paper:PAPER,radius:4,width:"wide",font:"Source Serif"},
    settings:{notifyEnabled:false,notifyTo:"",
      confirmation:"Saved in this local demonstration. No external message was sent.",
      retentionDays:90,access:"workspace",closed:false,closeMessage:"This enquiry is not accepting new entries.",
      version:1}};
}

const themeDeck={
  id:"collective-editorial",name:"Northline Editorial",
  colours:{ink:INK,muted:"#686D62",background:PAPER,surface:"#FFFFFF",
    accent:COPPER,accentInk:"#FFFFFF",support:SAGE,line:"#CBC6BB"},
  headingFont:"Georgia",bodyFont:"Inter",headingScale:1.05,fontSubstitutions:[],
};
const slideText=(id:string,text:string,x:number,y:number,w:number,h:number,size:number,colourToken="ink",weight:400|500|600|650|700=400)=>({
  id,type:"text",name:id,x,y,w,h,rotation:0,z:3,
  text:{text,size,weight,align:"start",valign:"center",colourToken},
  animation:{effect:"riseUp",order:1,durationMs:650,delayMs:120,easing:"ease-out",trigger:"onAppear"},
});
const rect=(id:string,x:number,y:number,w:number,h:number,fillToken:string)=>({
  id,type:"shape",name:id,x,y,w,h,rotation:0,z:1,
  shape:{kind:"rect",fillToken,strokeWidth:0,radius:0,opacity:1}});
const makeSlide=(n:number,name:string,kicker:string,headline:string,detail:string,kind:"title"|"editorial"|"metrics"="editorial")=>({
  id:`nc-slide-${n}`,title:name,layoutId:"collective-art",
  objects:[
    rect(`panel-${n}`,0,0,960,540,n%2?"background":"ink"),
    rect(`stripe-${n}`,48,48,86,5,"accent"),
    ...(kind==="metrics"?[
      {id:"nc-chart-1",type:"chart",name:"Illustrative revenue mix",x:82,y:210,w:780,h:255,
        rotation:0,z:2,chart:{kind:"bar",title:"Illustrative revenue by division (GBP)",
          series:[{name:"Revenue",points:[{label:"Harbor",value:388000},{label:"Atelier",value:216000},{label:"Experiences",value:44200}]}],
          capturedAt:"2026-11-18",linked:false,showLabels:true}},
    ]:[]),
    slideText(`kicker-${n}`,kicker.toUpperCase(),56,76,840,32,16,"accent",600),
    slideText(`headline-${n}`,headline,56,132,850,kind==="metrics"?72:230,kind==="title"?72:56,n%2?"ink":"accentInk",650),
    ...(kind==="metrics"?[]:[slideText(`detail-${n}`,detail,62,390,785,80,22,n%2?"muted":"accentInk",400)]),
    slideText(`folio-${n}`,`NORTHLINE COLLECTIVE    /    ${String(n).padStart(2,"0")}`,55,505,850,20,13,n%2?"muted":"accentInk",500),
  ],
  notes:`${name}. Fictional presentation. Use specific references and do not represent illustrative metrics as live actuals.`,
  transition:{effect:"fade",durationMs:550,easing:"ease-out"},targetSeconds:45,
});
function deckModel(brief:"portfolio"|"board"){
  const isPortfolio=brief==="portfolio";
  const slides=isPortfolio?[
    makeSlide(1,"Opening","A collective point of view","Spaces worth staying in.","Atelier / Objects / Experiences","title"),
    makeSlide(2,"What we believe","Manifesto","The best places make room for life.","An enduring visual language of material, rhythm and human scale."),
    makeSlide(3,"Lighthouse","Case study 01","A softer kind of arrival.","Forty-five rooms. One clear, considered material story."),
    makeSlide(4,"Harbor Supply","Objects","Design that earns its place.","Useful, sculptural furniture and lighting made to age beautifully."),
    makeSlide(5,"Partnership","Next chapter","What shall we make together?","A conversation is always the beginning."),
  ]:[
    makeSlide(1,"Executive report","November 2026","Clarity for the next decision.","A fictional company operating report.","title"),
    makeSlide(2,"Operating mix","Performance","Revenue by division.","Illustrative metric snapshot.","metrics"),
    makeSlide(3,"Lighthouse","Delivery risk","The milestone that matters.","Client approval required before the procurement deadline."),
    makeSlide(4,"Next moves","Leadership","Three decisions. One direction.","Protect delivery, review campaign economics and approve supplier capacity."),
  ];
  return {theme:themeDeck,themes:[themeDeck],layouts:[{
    id:"collective-art",name:"Northline editorial",backgroundToken:"background",
    placeholders:[]}],slides,index:0,comments:[],approvals:[],exports:[],importNotes:[],reduceMotion:false};
}

function designModel(){
  const textStyle=(size:number,color:string,weight=600)=>({
    family:"Georgia",size,weight,lineHeight:1.05,letterSpacing:-1,align:"start",color});
  const node=(id:string,kind:string,name:string,x:number,y:number,w:number,h:number,extra:Record<string,unknown>={})=>({
    id,kind,name,x,y,w,h,rotation:0,opacity:1,visible:true,locked:false,
    constraints:{h:"min",v:"min"},...extra});
  return {version:2,pages:[{
    id:"nc-brand-page",name:"Campaign art direction",background:PAPER,gridKind:"columns",
    roots:[node("nc-artboard","frame","Editorial poster 1200 × 1600",0,0,1200,1600,
      {fill:{type:"solid",color:PAPER},radius:0})],
    frameChildren:{"nc-artboard":[
      node("nc-copper","ellipse","Copper form",480,280,520,520,{fill:{type:"solid",color:COPPER}}),
      node("nc-paper-cut","ellipse","Negative space",580,340,310,310,{fill:{type:"solid",color:PAPER}}),
      node("nc-rule","rect","Ruling line",100,130,140,6,{fill:{type:"solid",color:INK}}),
      node("nc-title","text","Manifesto",100,900,960,270,{text:"SPACES WORTH\nSTAYING IN.",
        textStyle:textStyle(106,INK,700)}),
      node("nc-sub","text","Signature",105,1310,900,100,{
        text:"NORTHLINE  /  ATELIER · OBJECTS · EXPERIENCES",
        textStyle:{...textStyle(25,INK,500),family:"Inter",letterSpacing:1.5}}),
    ]},
  }],activePageId:"nc-brand-page",
    tokens:[{id:"c-ink",name:"Ink",value:INK,group:"Brand"},
      {id:"c-copper",name:"Copper",value:COPPER,group:"Brand"},
      {id:"c-paper",name:"Paper",value:PAPER,group:"Brand"}],
    comments:[],reviews:[],versions:[],assets:[],exports:[],unsupported:[]};
}

function motionModel(){
  const frame=(id:string,t:number,value:number)=>({id,t,value,easing:{kind:"ease-out"}});
  return {version:2,width:1200,height:675,fps:30,duration:4.5,background:INK,loop:false,
    layers:[
      {id:"nc-motion-circle",name:"Copper orbit",kind:"ellipse",visible:true,locked:false,
        box:{x:650,y:60,w:340,h:340},fill:COPPER,
        tracks:{scale:[frame("sc0",0,0.55),frame("sc1",1.6,1)],
          opacity:[frame("o0",0,0),frame("o1",1.2,1)]}},
      {id:"nc-motion-cut",name:"Cutout",kind:"ellipse",visible:true,locked:false,
        box:{x:715,y:125,w:210,h:210},fill:INK,tracks:{}},
      {id:"nc-motion-title",name:"Headline",kind:"text",visible:true,locked:false,
        box:{x:92,y:240,w:920,h:150},fill:PAPER,text:"SPACES WORTH\nSTAYING IN.",
        textStyle:{family:"Georgia",size:84,weight:600,align:"start"},
        tracks:{opacity:[frame("t0",0.4,0),frame("t1",1.4,1)],
          y:[frame("y0",0.4,42),frame("y1",1.5,0)]}},
      {id:"nc-motion-end",name:"Signature",kind:"text",visible:true,locked:false,
        box:{x:98,y:490,w:820,h:54},fill:PAPER,text:"NORTHLINE  /  COLLECTIVE",
        textStyle:{family:"Inter",size:24,weight:500,align:"start"},
        tracks:{opacity:[frame("e0",1.8,0),frame("e1",2.7,1)]}},
    ],states:[],triggers:[],onionSkin:{before:2,after:2,opacity:0.25},
    reducedMotion:{strategy:"cross-fade",note:"Show final artwork without motion"},
    renders:[],assets:[],tests:[],review:{state:"not_required",reasons:[]},
    presets:[],activeLayerId:"nc-motion-title"};
}
function videoModel(){
  const clip=(id:string,trackId:string,start:number,duration:number,sourceId:string,name:string,text?:string)=>({
    id,trackId,start,sourceIn:0,duration,sourceId,name,
    ...(text?{text,textStyle:{size:52,weight:600,color:PAPER,align:"center",family:"Georgia"}}:{}),
    opacity:1,transform:{scale:1,x:0,y:0,rotation:0},effects:[],fadeIn:0.65,fadeOut:0.5});
  return {version:2,fps:25,width:1920,height:1080,duration:45,
    tracks:[
      {id:"nc-v",name:"Scenes",kind:"video",order:1,muted:false,solo:false,locked:false,height:70},
      {id:"nc-t",name:"Editorial titles",kind:"title",order:2,muted:false,solo:false,locked:false,height:52},
      {id:"nc-a",name:"Original demo ambience",kind:"audio",order:0,muted:false,solo:false,locked:false,
        height:42,gainDb:-14,pan:0}],
    clips:[
      clip("nc-c1","nc-v",0,10,"nc-src1","Architecture / shadow"),
      clip("nc-c2","nc-v",10,12,"nc-src2","Objects / orbit"),
      clip("nc-c3","nc-v",22,12,"nc-src3","Material / texture"),
      clip("nc-c4","nc-v",34,11,"nc-src1","The collective"),
      clip("nc-t1","nc-t",2,6,"","Spaces worth staying in.","SPACES WORTH\nSTAYING IN."),
      clip("nc-t2","nc-t",24,6,"","Objects with intention","OBJECTS WITH\nINTENTION."),
      clip("nc-t3","nc-t",38,5,"","Northline Collective","NORTHLINE\nCOLLECTIVE"),
      clip("nc-a1","nc-a",0,45,"nc-ambience","Studio ambience"),
    ],
    transitions:[{id:"nc-x1",fromClipId:"nc-c1",toClipId:"nc-c2",kind:"cross-dissolve",duration:1}],
    captions:[
      {id:"nc-cap1",start:3,end:8,text:"Spaces worth staying in.",speaker:"Narrator",reviewed:false,language:"en"},
      {id:"nc-cap2",start:14,end:20,text:"The best objects make room for life.",speaker:"Narrator",reviewed:false,language:"en"},
      {id:"nc-cap3",start:26,end:33,text:"Material first. Feeling always.",speaker:"Narrator",reviewed:false,language:"en"},
      {id:"nc-cap4",start:37,end:44,text:"Northline Collective.",speaker:"Narrator",reviewed:false,language:"en"},
    ],
    sources:[
      {id:"nc-src1",name:"Architectural scene (synthetic in-editor)",kind:"video",duration:16,
        look:{hue:32,motion:"push",subject:"room",grain:0.035},license:"Generated demo scene",credit:"Arlovi local renderer",proxy:"generated"},
      {id:"nc-src2",name:"Product orbit (synthetic in-editor)",kind:"video",duration:16,
        look:{hue:23,motion:"orbit",subject:"lamp",grain:0.02},license:"Generated demo scene",credit:"Arlovi local renderer",proxy:"generated"},
      {id:"nc-src3",name:"Material detail (synthetic in-editor)",kind:"video",duration:16,
        look:{hue:47,motion:"pan",subject:"room",grain:0.07},license:"Generated demo scene",credit:"Arlovi local renderer",proxy:"generated"},
      {id:"nc-ambience",name:"Generated demo ambience",kind:"audio",duration:60,
        look:{hue:0,motion:"static",subject:"bars",grain:0},
        tone:{root:90,kind:"music",tempo:72},license:"Synthesised in-editor",credit:"Local synthesis"},
    ],
    markers:[{id:"nc-m1",at:0,label:"01 / Place"},{id:"nc-m2",at:10,label:"02 / Object"},
      {id:"nc-m3",at:22,label:"03 / Material"},{id:"nc-m4",at:34,label:"04 / Brand"}],
    reviews:[],renders:[],loudnessTarget:-16};
}
function publicationModel(){
  const A4={id:"a4",name:"A4 portrait",width:595.28,height:841.89};
  return {version:2,size:A4,facingPages:true,
    margins:{top:50,bottom:50,inside:45,outside:45},bleed:8.5,slug:14,
    baseline:{start:50,step:14,visible:false},columns:{count:2,gutter:24,visible:true},
    pages:[
      {id:"nc-p1",masterId:undefined,overrides:[],frames:[
        {id:"nc-fr1",kind:"text",box:{x:55,y:70,w:480,h:250},
          columns:1,gutter:0,inset:0,storyId:"nc-story",styleId:"nc-head"},
        {id:"nc-fr2",kind:"text",box:{x:55,y:335,w:480,h:440},
          columns:2,gutter:20,inset:0,storyId:"nc-story",styleId:"nc-body"}]},
      {id:"nc-p2",masterId:undefined,overrides:[],frames:[
        {id:"nc-fr3",kind:"text",box:{x:55,y:70,w:480,h:640},
          columns:2,gutter:20,inset:0,storyId:"nc-story",styleId:"nc-body"}]},
    ],masters:[],
    stories:[{id:"nc-story",name:"Northline manifesto",text:[
      "The form of belonging","Places are not simply made. They are collected, remembered, inhabited.",
      "Material first","Every finish has a history. We choose honest surfaces whose character grows with use.",
      "Light as architecture","Light shapes how we meet, rest, move and remember.",
      "For the everyday","We design for the moments between the photographs. The places people choose to stay."
    ].join("\n"),styleByParagraph:{0:"nc-head",2:"nc-sub",4:"nc-sub",6:"nc-sub"}}],
    paragraphStyles:[
      {id:"nc-head",name:"Display",family:"Georgia",size:38,leading:44,tracking:-1,weight:700,
        align:"left",spaceBefore:0,spaceAfter:22,firstLineIndent:0,hyphenate:false,
        alignToBaseline:false,color:INK},
      {id:"nc-sub",name:"Section",family:"Inter",size:16,leading:20,tracking:0.3,weight:650,
        align:"left",spaceBefore:18,spaceAfter:10,firstLineIndent:0,hyphenate:false,
        alignToBaseline:false,color:COPPER},
      {id:"nc-body",name:"Body",family:"Georgia",size:12,leading:19,tracking:0,weight:400,
        align:"left",spaceBefore:0,spaceAfter:9,firstLineIndent:0,hyphenate:true,
        alignToBaseline:false,color:INK},
    ],characterStyles:[],activePageId:"nc-p1",colourMode:"RGB",fonts:["Georgia","Inter"]};
}
export function createFlagshipCreative(make: FlagshipMake): Rec[] {
  const rows: Rec[] = [];
  const add=(collection:string,n:number,title:string,extra:Partial<Rec>)=>rows.push(make(collection,n,title,extra));
  add("sites",1,"Northline Collective — Editorial portfolio",{
    status:"active",summary:"Six-page fully editable site model, magazine-like art direction and a linked multi-step enquiry.",
    fields:{delivery:"not_connected",pages:6,flagship:true,visualPreview:"/showcase/northline-collective",
      projectType:"portfolio",externalHostVerified:false},body:siteModel()});
  for(const [n,name,kind] of [[1,"Project enquiry","project"],[2,"Consultation booking","visit"],[3,"Wholesale trade application","trade"]] as const)
    add("forms",n,name,{status:"draft",summary:"Branded and conditional form; local preview only.",
      fields:{publishedExternally:false,delivery:"not_connected",version:1},body:formModel(kind)});
  add("decks",1,"NORTHLINE — Brand / portfolio story",{
    status:"in_review",summary:"Five fully editable art-directed slides with deliberate typography, motion and speaker notes.",
    fields:{kind:"presentation",slides:5,source:"fictional portfolio"},body:deckModel("portfolio")});
  add("decks",2,"Northline Collective — Executive review",{
    status:"draft",summary:"Board narrative with source-labelled illustrative revenue chart and operating decisions.",
    fields:{kind:"presentation",slides:4,source:"local synthetic records"},body:deckModel("board")});
  add("designs",1,"Spaces worth staying in — Art direction",{
    status:"in_review",summary:"Editable vector editorial artwork with distinct copper and ivory identity.",
    fields:{kind:"file",format:"Editorial poster 1200 × 1600",width:1200,height:1600,
      assetLink:id("assets",1)},body:designModel()});
  add("motions",1,"Northline — 4.5s brand ident",{
    status:"draft",summary:"Four-layer editable animated title, copper orbit and reduced-motion specification.",
    fields:{kind:"composition",width:1200,height:675,fps:30,duration:4.5},
    body:motionModel()});
  add("videos",1,"Spaces worth staying in — 45-second brand film",{
    status:"in_review",summary:"Editable 25fps timeline with four acts, synthetic locally rendered scenes, captions and title tracks. Not a rendered commercial.",
    fields:{kind:"sequence",width:1920,height:1080,fps:25,duration:45,exportVerified:false},
    body:videoModel()});
  add("publications",1,"The Northline Book — Editorial manifesto",{
    status:"draft",summary:"Editable A4 publication with page frames, typography and flowing editorial copy.",
    fields:{kind:"publication",pages:2,size:"A4 portrait",bleedMm:3},body:publicationModel()});
  for(let i=1;i<=28;i++){
    const name=i===1?"Northline Collective — Signature monogram":`Northline Brand Library · ${LINES[i%LINES.length]} ${i}`;
    const svg=i===1?`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 360"><rect width="360" height="360" fill="${PAPER}"/><path d="M100 259V98h32l96 108V98h32v161h-32L132 150v109z" fill="${INK}"/><circle cx="282" cy="92" r="13" fill="${COPPER}"/></svg>`:
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420"><rect width="600" height="420" fill="${PAPER}"/><circle cx="372" cy="195" r="136" fill="${COPPER}"/><circle cx="406" cy="180" r="78" fill="${PAPER}"/><path d="M64 344h472" stroke="${INK}" stroke-width="3"/><text x="64" y="388" fill="${INK}" font-family="serif" font-size="25">NORTHLINE COLLECTIVE</text></svg>`;
    add("assets",i,name,{status:"approved",summary:"Original vector artwork embedded as editable SVG source; no external photo licensing.",
      fields:{kind:"vector",format:"svg",fileState:"stored_svg",width:i===1?360:600,height:i===1?360:420,
        licence:"original_demo_artwork",brandId:id("brands",1),approvedBy:"Northline Demo Studio",
        checksum:`nc-asset-${i}`},body:{svg}});
  }
  add("brands",1,"Northline Collective — Identity system",{
    status:"approved",fields:{palette:`${INK},${PAPER},${COPPER},${SAGE}`,primaryFont:"Georgia",
      bodyFont:"Inter",claim:"Fictional showcase identity"},
    body:{voice:"Precise, warm, editorial; never overdesigned.",
      colourTokens:{ink:INK,paper:PAPER,copper:COPPER,sage:SAGE,soft:MONO},
      applications:["Editorial website","Decks","Print","Motion","Studio templates"]}});
  add("photos",1,"Cove — Tonal product study",{
    status:"active",summary:"Layered in-editor synthetic product study. Not an actual photograph.",
    fields:{kind:"image",width:1600,height:1200,album:"Materials",license:"synthetic_demo"},
    body:{version:2,width:1600,height:1200,
      layers:[{id:"nc-bg",name:"Warm paper",kind:"pixel",visible:true,locked:false,opacity:1,
        blend:"normal",x:0,y:0,w:1600,h:1200,rotation:0},
        {id:"nc-tone",name:"Copper wash",kind:"fill",visible:true,locked:false,opacity:0.25,
          blend:"multiply",color:COPPER,x:0,y:0,w:1600,h:1200,rotation:0}],
      activeLayerId:"nc-tone",presets:[],profile:"sRGB IEC61966-2.1",
      rights:{license:"Synthetic demo image",credit:"Arlovi generated canvas"},history:[]}});
  const cells={A1:"Division",B1:"Illustrative revenue",C1:"Share of total",
    A2:"Harbor Supply",B2:"388000",C2:"=B2/B5",
    A3:"Northline Atelier",B3:"216000",C3:"=B3/B5",
    A4:"Northline Experiences",B4:"44200",C4:"=B4/B5",
    A5:"Total",B5:"=SUM(B2:B4)",C5:"=SUM(C2:C4)",
    A7:"Basis",B7:"Fictional demonstration; not reconciled to the general ledger."};
  add("workbooks",1,"Collective — Revenue mix / working model",{
    status:"active",fields:{kind:"workbook",sheets:1,source:"fictional illustrative"},
    body:{sheets:[{id:"nc-financial-sheet",name:"Illustrative mix",rows:200,cols:26,cells,
      styles:{A1:{bold:true},B1:{bold:true},C1:{bold:true},
        B2:{format:"currency"},B3:{format:"currency"},B4:{format:"currency"},B5:{format:"currency",bold:true},
        C2:{format:"percent"},C3:{format:"percent"},C4:{format:"percent"},C5:{format:"percent"}},
      colWidths:{A:240,B:210,C:180},freeze:{rows:1,cols:1},filters:[]}],
      index:0,namedRanges:[],charts:[],history:[]}});
  add("documents",1,"Lighthouse Hotels — The design approach",{
    status:"draft",summary:"Editable project brief and material direction.",
    fields:{projectId:id("projects",1),kind:"proposal"},
    body:{blocks:[
      {id:"ncd-1",type:"heading1",text:"LIGHTHOUSE / A QUIETER KIND OF ARRIVAL"},
      {id:"ncd-2",type:"paragraph",text:"Forty-five rooms organised around warmth, rest and a considered palette of linen, oak and bronze."},
      {id:"ncd-3",type:"heading2",text:"Design principles"},
      {id:"ncd-4",type:"paragraph",text:"Reduce visual noise. Control glare. Let objects acquire character. Treat every guest journey as part of the room."},
      {id:"ncd-5",type:"heading2",text:"Commercial scope"},
      {id:"ncd-6",type:"paragraph",text:"Illustrative £185,000 opportunity. Client sign-off, procurement and delivery milestones remain subject to approval."},
    ],comments:[],suggestions:[],bookmarks:[],references:[],suggestMode:false,shares:[]}});
  add("appProjects",1,"Northline — Client specification portal",{
    status:"draft",summary:"Visual application schema for client approvals and project milestones.",
    fields:{environment:"local",deployed:false},
    body:{settings:{name:"Northline Client Desk",description:"Private specification and approvals workspace",
      environment:"preview",locale:"en-GB"},
      entities:[{id:"e-project",name:"Project",collection:"projects",fields:[
        {id:"f-name",name:"Name",kind:"text",required:true,unique:false,options:[],references:""},
        {id:"f-status",name:"Stage",kind:"choice",required:true,unique:false,
          options:["Concept","Review","Approved"],references:""}]}],
      screens:[{id:"s-home",name:"Project overview",route:"/projects",
        components:[{id:"c-title",kind:"text",title:"Your project",entityId:"",
          fieldIds:[],aggregate:"count",text:"A clear place for decisions.",span:12},
          {id:"c-table",kind:"table",title:"Project milestones",entityId:"e-project",
            fieldIds:["f-name","f-status"],aggregate:"count",text:"",span:12}]}],
      actions:[],data:[],environments:[],deployments:[]}});

  return rows;
}
