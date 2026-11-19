import { registerSeed } from "@/domain/seedRegistry";
import { NORTHLINE_COLORS } from "@/domain/flagship/identity";
import type { Rec } from "@/domain/types";
import type { DesignDoc, SceneNode, ScenePage } from "@/applications/design/scene";
import type { PublicationDoc, Page, ParagraphStyle, Frame } from "@/applications/layout/flow";

/**
 * Fully editable, art-directed Northline Collective studio work.
 * Real scene-graph/vector objects, document frames and video edit timelines.
 * No purported real photographs, model execution or external publication.
 *
 * This contributor uses 91x IDs, separate from the 90x flagship core records.
 */
const C = {
  ink: NORTHLINE_COLORS.ink, leaf: NORTHLINE_COLORS.darkRule,
  paper: NORTHLINE_COLORS.canvas, white: NORTHLINE_COLORS.white,
  clay: NORTHLINE_COLORS.violet, gold: NORTHLINE_COLORS.acid,
  rose: NORTHLINE_COLORS.apricot, slate: NORTHLINE_COLORS.bluePaper,
  fog: NORTHLINE_COLORS.rule,
};
type Kind = SceneNode["kind"];
const N = (id: string, kind: Kind, name: string, x: number, y: number, w: number, h: number, extra: Partial<SceneNode> = {}): SceneNode => ({
  id,kind,name,x,y,w,h,rotation:0,opacity:1,visible:true,locked:false,
  constraints:{h:"min",v:"min"},...extra,
});
const block = (id: string, name: string, x: number,y: number,w: number,h: number, fill: string, radius=0) =>
  N(id,"rect",name,x,y,w,h,{fill:{type:"solid",color:fill},radius});
const circle = (id:string,name:string,x:number,y:number,w:number,h:number,fill:string) =>
  N(id,"ellipse",name,x,y,w,h,{fill:{type:"solid",color:fill}});
const textNode = (id:string,name:string,text:string,x:number,y:number,w:number,h:number,size:number,color:string,serif=false,weight=400):SceneNode =>
  N(id,"text",name,x,y,w,h,{text,textStyle:{family:serif?"Newsreader":"Manrope",size,weight,lineHeight:serif?1.04:1.22,letterSpacing:serif?-1.4:0.6,align:"start",color}});
const line = (id:string,name:string,x:number,y:number,w:number,h:number,color:string,width=2) =>
  N(id,"line",name,x,y,w,h,{stroke:{color,width,align:"center"}});
const palette = Object.entries(C).map(([id,value])=>({id:"collective-"+id,name:id.toUpperCase(),value,group:"Northline Collective"}));
const textStyles = [
  {id:"type-display",name:"Editorial / 98",family:"Manrope",size:98,weight:700,lineHeight:1.04,letterSpacing:-1.4},
  {id:"type-title",name:"Title / 44",family:"Newsreader",size:44,weight:500,lineHeight:1.08,letterSpacing:-1},
  {id:"type-kicker",name:"Label / 14",family:"DM Mono",size:14,weight:400,lineHeight:1.3,letterSpacing:2},
  {id:"type-copy",name:"Body / 22",family:"Manrope",size:22,weight:400,lineHeight:1.4,letterSpacing:0},
];
const page = (id:string,name:string,width:number,height:number,children:SceneNode[],background=C.paper):ScenePage => {
  const frameId=id+"-frame";
  const artboard=N(frameId,"frame",name+" — artboard",0,0,width,height,{fill:{type:"solid",color:background},radius:0});
  return {
    id,name,background:"#D5D1C7",grid:{kind:"columns",size:8,count:12,gutter:24,visible:false},
    nodes:Object.fromEntries([artboard,...children].map(n=>[n.id,n])),
    children:{[id]:[frameId],[frameId]:children.map(n=>n.id)},
  };
};
const compose = (pages:ScenePage[],description:string):DesignDoc => ({
  version:2,pages,activePageId:pages[0].id,components:[],textStyles,colors:palette,
  effects:[{id:"fx-print",name:"Soft printed depth",shadow:{x:0,y:12,blur:28,spread:0,color:"rgba(25,36,33,0.15)"}}],
  breakpoints:[{id:"desktop",name:"Desktop",width:1440},{id:"tablet",name:"Tablet",width:834},{id:"mobile",name:"Mobile",width:390}],
  comments:[{id:"review-1",pageId:pages[0].id,x:1050,y:160,author:"Maya Chen",at:"2026-11-12T09:00:00.000Z",text:"Review on-screen and print contrast before release.",resolved:false}],
  reviews:[{id:"review-round-1",version:1,by:"Maya Chen",at:"2026-11-13T10:00:00.000Z",state:"pending",note:description}],
  versions:[{id:"version-1",at:"2026-11-14T09:30:00.000Z",by:"Collective Studio",label:"Editorial concept issued for review",nodeCount:pages.reduce((count,p)=>count+Object.keys(p.nodes).length,0)}],
  assets:[],exports:[],prototype:{startNodeId:pages[0].children[pages[0].id][0],device:"Desktop 1440"},
  unsupported:[],
});
const mainIdentity=compose([
  page("brand-01","01 · Master identity",1440,900,[
    block("b01-left","Moss field",0,0,1440,900,C.ink),
    block("b01-corner","Copper accent",1190,0,250,900,C.clay),
    circle("b01-halo","Offset mineral disk",925,115,390,390,C.gold),
    circle("b01-shadow","Deep material shadow",1030,210,300,300,C.leaf),
    line("b01-rule","Fine editorial rule",95,128,1110,0,C.white,2),
    textNode("b01-logo","Logotype","NORTHLINE",95,172,1100,140,128,C.white,true),
    textNode("b01-collective","Wordmark suffix","C O L L E C T I V E",101,312,750,72,42,C.paper),
    textNode("b01-manifesto","Headline","Material.\nSpace.\nExperience.",95,488,810,250,81,C.paper,true),
    textNode("b01-label","Company designation","INDEPENDENT DESIGN / OBJECTS / EXPERIENCES",95,808,960,35,17,C.white),
    textNode("b01-no","Serial", "N° 01",1260,820,150,35,19,C.white),
  ],C.ink),
  page("brand-02","02 · Product campaign",1080,1350,[
    block("b02-bg","Warm stone background",0,0,1080,1350,C.paper),
    block("b02-rule","Material stripe",90,137,900,5,C.ink),
    circle("b02-halo","Material light",530,250,490,490,C.gold),
    circle("b02-inside","Lamp light",620,335,305,305,C.paper),
    line("b02-stem","Brass lamp stem",780,540,0,440,C.ink,16),
    circle("b02-base","Weighted base",646,965,270,46,C.ink),
    block("b02-shade","Brass fitting",634,525,292,46,C.clay,20),
    textNode("b02-overline","Kicker","NORTHLINE / OBJECT STUDY 001",90,78,870,45,21,C.ink),
    textNode("b02-head","Campaign title","The beauty\nof the\nordinary.",90,745,750,240,108,C.ink,true),
    line("b02-divider","Footer separator",90,1145,900,0,C.ink,2),
    textNode("b02-footer","Footer","THE ARC COLLECTION    /    MATERIALS & LIGHT",90,1182,900,46,22,C.ink),
    textNode("b02-number","Edition", "01 / 03",90,1273,330,25,16,C.clay),
  ]),
  page("brand-03","03 · Spatial practice",1440,900,[
    block("b03-base","Artboard charcoal",0,0,1440,900,C.ink),
    block("b03-plane","Architectural plane",740,0,700,900,C.leaf),
    block("b03-wall","Warm architectural wall",850,100,420,750,C.fog),
    circle("b03-arch","Architectural arch top",850,70,420,420,C.fog),
    block("b03-door","Shadow aperture",942,245,235,605,C.ink),
    circle("b03-lamp","Light source",990,345,137,137,C.gold),
    block("b03-floor","Gallery floor",740,795,700,105,C.clay),
    textNode("b03-over","Section label","NORTHLINE / ATELIER",90,96,620,50,22,C.paper),
    textNode("b03-head","Editorial headline","Spaces that\nstay with\nyou.",90,250,730,380,112,C.white,true),
    textNode("b03-copy","Subtitle","DESIGNED FOR LIFE, NOT JUST A PHOTOGRAPH.",94,761,650,35,19,C.paper),
    line("b03-rule","Fine divider",90,834,610,0,C.white,2),
  ],C.ink),
],"Original material-led identity suite: full colour, social campaign, spatial expression.");

const proposals=compose([
  page("project-01","Lighthouse · Cover",1440,900,[
    block("p1-back","Mineral field",0,0,1440,900,C.paper),
    block("p1-side","Editorial column",925,0,515,900,C.clay),
    circle("p1-arch-outer","Architectural arch",997,176,362,365,C.gold),
    block("p1-arch-base","Arch column",997,357,362,445,C.gold),
    circle("p1-arch-inner","Room void arch",1041,230,270,270,C.leaf),
    block("p1-arch-door","Room void",1041,365,270,435,C.leaf),
    circle("p1-luminaire","Warm light",1118,418,115,115,C.paper),
    textNode("p1-label","Small heading","NORTHLINE ATELIER / HOSPITALITY",90,100,800,45,20,C.ink),
    textNode("p1-title","Case title","Light\nas architecture.",90,294,950,290,111,C.ink,true),
    textNode("p1-note","Project subtitle","LIGHTHOUSE HOTELS · 45 ROOMS · CONCEPT & SPECIFICATION",96,730,790,64,18,C.ink),
    line("p1-rule","Closing baseline",90,825,815,0,C.ink,2),
  ]),
  page("project-02","Lighthouse · Material palette",1440,900,[
    block("p2-bg","Background",0,0,1440,900,C.white),
    textNode("p2-caption","Page number","02 / THE MATERIAL INTELLIGENCE",100,92,1180,46,19,C.ink),
    textNode("p2-title","Title","Less,\nbut more felt.",100,224,670,260,108,C.ink,true),
    block("p2-swatch1","Burnished bronze",825,205,190,445,C.clay),
    block("p2-swatch2","Aged mineral",1025,205,190,445,C.leaf),
    block("p2-swatch3","Warm linen",1225,205,135,445,C.fog),
    textNode("p2-copy","Research note","A coherent lighting language is not the same as repeating one fitting in every room. We propose warm material continuity with carefully varied light levels.",101,570,620,170,32,C.ink),
    line("p2-end","Bottom line",100,803,1250,0,C.ink,2),
    textNode("p2-foot","Folio","NORTHLINE / LIGHTHOUSE / CONCEPT DRAFT",100,820,980,39,17,C.ink),
  ]),
],"A client-ready but fictional proposal: material provenance and direction require human approval.");

const PT=72/25.4;
const mm=(n:number)=>n*PT;
const A4={id:"a4",name:"A4 portrait",width:595.28,height:841.89};
const paragraphStyles:ParagraphStyle[]=[
  {id:"cover",name:"Display",family:"Newsreader",size:38,leading:43,tracking:-1.2,weight:400,align:"left",spaceBefore:0,spaceAfter:12,firstLineIndent:0,hyphenate:false,alignToBaseline:false,color:C.ink},
  {id:"intro",name:"Introduction",family:"Newsreader",size:16,leading:24,tracking:0,weight:400,align:"left",spaceBefore:0,spaceAfter:12,firstLineIndent:0,hyphenate:false,alignToBaseline:false,color:C.ink},
  {id:"body",name:"Reading text",family:"Georgia",size:11,leading:17,tracking:0,weight:400,align:"left",spaceBefore:0,spaceAfter:6,firstLineIndent:0,hyphenate:true,alignToBaseline:true,color:C.ink},
  {id:"label",name:"Label",family:"DM Mono",size:10,leading:14,tracking:1,weight:700,align:"left",spaceBefore:0,spaceAfter:10,firstLineIndent:0,hyphenate:false,alignToBaseline:false,color:C.clay},
];
const publication = ():PublicationDoc => {
  const chapters=[
    ["MATERIAL.\nSPACE.\nEXPERIENCE.","An independent house of ideas. We believe our most important work is not to make things look beautiful, but to make them worth living with."],
    ["A point of view.","Every object earns its place through use. Every space creates room for the people who inhabit it. We start with observation, then build toward something quietly surprising."],
    ["The collection.","ARC — a study in the unexpected beauty of the curve.\nRAVELIN — proportion and precision in light.\nSOLACE — the generous presence of material in the everyday."],
    ["Spaces that stay.","Lighthouse Hotels explores light as architecture. Forty-five rooms are connected through a shared palette of warm metals, quiet textiles and carefully controlled brightness. The project is fictional, but the process is rigorous."],
    ["The work of making.","Design is not finished when it leaves a screen. We review samples, test assemblies, document tolerances, invite critique and keep a detailed record of why decisions were made."],
    ["Made for living.","We believe in repairable components, transparent sourcing and truthful material descriptions. A responsible object can age without becoming disposable."],
    ["Gather around.","Our experiences create room for learning: workshops in material thinking, personal consultations, demonstrations and gatherings that make the craft accessible."],
    ["Begin a conversation.","A project starts with a good question. What should the space, object or experience make someone feel?\n\nNorthline Collective is a fictional Arlovi flagship demonstration. The brand, business results and projects shown here are not real claims."],
  ];
  const pages:Page[]=chapters.map((_,i)=>{
    const id="pub-p"+(i+1);
    const isCover=i===0;
    const frames:Frame[]=[
      {id:id+"-bg",kind:"shape",box:{x:0,y:0,w:A4.width,h:A4.height},fill:isCover?C.ink:i%2===0?C.paper:C.white},
      {id:id+"-spine",kind:"shape",box:{x:isCover?515:40,y:72,w:isCover?80:3,h:694},fill:i%2===0?C.clay:C.leaf},
      {id:id+"-text",kind:"text",box:{x:68,y:isCover?240:182,w:455,h:isCover?355:475},columns:1,gutter:0,inset:0,storyId:"story-"+(i+1),styleId:"cover"},
      {id:id+"-num",kind:"folio",box:{x:68,y:785,w:400,h:20},template:"NORTHLINE COLLECTIVE  /  {page} OF {pages}",styleId:"label"},
    ];
    return{id,frames,masterId:undefined,overrides:[]};
  });
  const stories=chapters.map((chapter,i)=>({
    id:"story-"+(i+1),name:"Editorial chapter "+(i+1),
    text:chapter.join("\n"),
    styleByParagraph:{0:"cover",1:"intro"}
  }));
  // The cover uses a light title style on its deep ink background.
  const coverStyle={...paragraphStyles[0],id:"cover-reverse",color:C.white};
  stories[0].styleByParagraph[0]="cover-reverse";
  return{
    version:2,size:A4,facingPages:true,
    margins:{top:mm(24),bottom:mm(24),inside:mm(20),outside:mm(17)},
    bleed:mm(3),slug:mm(6),
    baseline:{start:mm(24),step:17,visible:false},
    columns:{count:1,gutter:mm(5),visible:false},pages,masters:[],stories,
    paragraphStyles:[...paragraphStyles,coverStyle],
    characterStyles:[],activePageId:"pub-p1",colourMode:"RGB",fonts:["Newsreader","Manrope","DM Mono","Georgia"],
  };
};
const grade = {exposure:0.12,contrast:9,saturation:-6,temperature:4,tint:0,highlights:-9,shadows:10,curve:[{x:0,y:0},{x:110,y:102},{x:255,y:249}]};
const photoDoc = (name:string,width:number,height:number,accent:string) => ({
  version:2,width,height,layers:[
    {id:"plate",name:"Procedurally generated plate — not original photography",kind:"pixel",visible:true,locked:false,opacity:1,blend:"normal",x:0,y:0,w:width,h:height,rotation:0},
    {id:"shade",name:"Art direction / soft material wash",kind:"fill",visible:true,locked:false,opacity:.13,blend:"multiply",color:accent,x:0,y:0,w:width,h:height,rotation:0},
    {id:"finish",name:"Natural contrast and warm mineral grade",kind:"adjustment",visible:true,locked:false,opacity:1,blend:"normal",x:0,y:0,w:0,h:0,rotation:0,adjust:grade},
  ],activeLayerId:"finish",
  presets:[{id:"grade-editorial",name:"Collective — Paper and Acid",adjust:grade}],
  profile:"sRGB IEC61966-2.1",rights:{license:"Demonstration artwork only",credit:"Generated in local canvas; no photography or model release obtained"},
  origin:name+" — generated raster preview in the native Arlovi photo editor. Replace with original photography before publishing.",
  history:[],
});
const sequence=()=>{
  const transformations={scale:1,x:0,y:0,rotation:0};
  const tracks=[
    {id:"v1",name:"Visual narrative",kind:"video",order:1,muted:false,solo:false,locked:false,height:58},
    {id:"t1",name:"Editorial typography",kind:"title",order:2,muted:false,solo:false,locked:false,height:44},
    {id:"a1",name:"Original generative tone (demo)",kind:"audio",order:0,muted:false,solo:false,locked:false,height:48,gainDb:-20,pan:0},
  ];
  const chapters=[
    {id:"material",name:"Material — the beginning",start:0,duration:15,hue:29,motion:"push",subject:"lamp"},
    {id:"space",name:"Space — atmosphere",start:15,duration:15,hue:126,motion:"pan",subject:"room"},
    {id:"people",name:"Experience — the human scale",start:30,duration:15,hue:20,motion:"orbit",subject:"hands"},
    {id:"collective",name:"Collective — a shared point of view",start:45,duration:15,hue:43,motion:"push",subject:"room"},
  ];
  const clips=chapters.flatMap((c,i)=>[
    {id:"shot-"+i,trackId:"v1",start:c.start,sourceIn:0,duration:c.duration,sourceId:"src-"+c.id,name:c.name,
      opacity:1,transform:transformations,effects:[{id:"grade-"+i,kind:"temperature",amount:9,bypassed:false}],fadeIn:i===0?1:0.3,fadeOut:i===3?1.3:0},
    {id:"title-"+i,trackId:"t1",start:c.start+3,sourceIn:0,duration:7,sourceId:"",name:c.id+" / title",
      text:["What we touch.","Where we belong.","What we share.","What remains."][i],
      textStyle:{size:72,weight:400,color:"#F6F0E7",align:"center",family:"Newsreader"},opacity:1,transform:transformations,
      effects:[],fadeIn:1.4,fadeOut:1.2},
  ]);
  clips.push({id:"tone",trackId:"a1",start:0,sourceIn:0,duration:60,sourceId:"src-tone",name:"Original generative atmosphere",
    opacity:1,transform:transformations,effects:[],fadeIn:2,fadeOut:4} as (typeof clips)[number]);
  return {
    version:2,fps:25,width:1920,height:1080,duration:60,tracks,clips,
    transitions:[{id:"tx-1",fromClipId:"shot-0",toClipId:"shot-1",kind:"cross-dissolve",duration:0.7},{id:"tx-2",fromClipId:"shot-2",toClipId:"shot-3",kind:"cross-dissolve",duration:0.8}],
    captions:[
      {id:"cap-1",start:4,end:11,text:"We begin with the things we can feel.",speaker:"Narrative title",reviewed:true,language:"en"},
      {id:"cap-2",start:20,end:26,text:"We make room for life.",speaker:"Narrative title",reviewed:true,language:"en"},
      {id:"cap-3",start:35,end:42,text:"The best things are shared.",speaker:"Narrative title",reviewed:true,language:"en"},
      {id:"cap-4",start:50,end:58,text:"Northline Collective. Material. Space. Experience.",speaker:"Narrative title",reviewed:true,language:"en"},
    ],
    sources:[...chapters.map(c=>({id:"src-"+c.id,name:c.name+" / generated storyboard proxy",kind:"video",duration:25,
      look:{hue:c.hue,motion:c.motion,subject:c.subject,grain:.05},
      license:"Synthetic proxy / demonstration",credit:"Arlovi local procedural renderer",proxy:"generated"})),
      {id:"src-tone",name:"Original procedural ambient tone",kind:"audio",duration:65,
        look:{hue:0,motion:"static",subject:"bars",grain:0},tone:{root:86,kind:"music",tempo:64},
        license:"Original procedural audio / demonstration",credit:"Arlovi local preview synthesis"}],
    markers:[{id:"mar-01",time:15,text:"Confirm texture continuity into architectural section",author:"Creative Director",at:"2026-11-14T09:30:00.000Z",resolved:false}],
    reviews:[{id:"film-review-01",at:"2026-11-14T09:30:00.000Z",by:"Maya Chen",state:"changes",note:"Storyboard approval only. Replace generated proxies with cleared footage before release.",revision:1}],
    renders:[],loudnessTarget:-16,
  };
};

registerSeed("flagship-studio", (ctx) => {
  const records:Rec[]=[];
  const add=(collection:string,n:number,title:string,body:unknown,fields:Record<string,string|number|boolean>,summary:string)=>{
    records.push(ctx.rec({org:"nl",collection,n:910+n,title,status:"draft",owner:"Collective Studio",
      summary,fields:{...fields,flagship:"Northline Collective",fictional:true,delivery:"local_only"},
      tags:["flagship","studio","editable"],body}));
  };
  add("designs",0,"Collective / Master identity and editorial campaign",mainIdentity,
    {kind:"file",format:"Art direction — 3 editable artboards",width:1440,height:900},
    "Three original vector artboards for the brand master, objects campaign and spatial practice.");
  add("designs",1,"Lighthouse Hotels / Spatial concept boards",proposals,
    {kind:"file",format:"Client concepts — 2 editable artboards",width:1440,height:900},
    "Fictional hospitality client concept boards with original vector illustration and material palette.");
  add("publications",0,"Northline / Material Space Experience — editorial book",publication(),
    {kind:"publication",size:"A4 portrait",pages:8,bleedMm:3},
    "Eight-page native publication: chapter copy, editorial grid, folios, colour planes and text styles.");
  add("photos",0,"Arc Collection / mineral editorial colour grade",photoDoc("Arc collection",1400,1000,C.clay),
    {kind:"image",width:1400,height:1000,album:"Collective — editorial",license:"Demonstration only"},
    "Editable layered tonal treatment on generated local pixels, not a claimed product photograph.");
  add("photos",1,"Lighthouse / atmospheric colour study",photoDoc("Lighthouse atmospheric study",1400,1000,C.leaf),
    {kind:"image",width:1400,height:1000,album:"Collective — hospitality",license:"Demonstration only"},
    "Editable colour study. Real commissioned photography requires source capture and rights clearance.");
  add("videos",0,"Northline / Ways of Living — editable 60s film",sequence(),
    {kind:"sequence",fps:25,width:1920,height:1080,duration:60},
    "Multitrack editable film storyboard, transitions, typographic cuts, captions and locally generated proxies; no filmed footage.");
  return {records};
});
