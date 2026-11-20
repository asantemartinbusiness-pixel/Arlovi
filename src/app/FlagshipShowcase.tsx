import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, ArrowUpRight, Boxes, BriefcaseBusiness, Clapperboard, FileText, Globe2, Layers3, Palette, Presentation, Sparkles, Users } from "lucide-react";
import { appEntry } from "@/app/catalog";
import { routeForRecord } from "@/platform/attention";
import { useCollections, useWorkspace } from "@/platform/workspace";
import type { Rec } from "@/domain/types";
import "./flagship-showcase.css";
import "./flagship-identity.css";

const GROUPS = ["designs","publications","photos","videos","decks","sites","forms","projects","deals","employees","agents","orders","campaigns","datasets"];
const STUDIO: { title:string; kind:string; code:string; id:string; description:string; style:string; icon:typeof Palette }[] = [
  {title:"The Collective identity",kind:"DESIGN SYSTEM / VECTOR",code:"DESIGN",id:"nl-designs-910",description:"Three original editable vector artboards. Explore the mark, campaign and architectural visual language.",style:"identity",icon:Palette},
  {title:"Material. Space. Experience.",kind:"EDITORIAL / PUBLICATION",code:"LAYOUT",id:"nl-publications-910",description:"An eight-page editorial book with live text stories, intentional typography, page geometry and folios.",style:"publication",icon:FileText},
  {title:"Lighthouse, reimagined",kind:"CLIENT EXPERIENCE / CONCEPT",code:"DESIGN",id:"nl-designs-911",description:"Architectural composition and material research brought together for a fictional hospitality client.",style:"lighthouse",icon:Layers3},
  {title:"Ways of Living",kind:"FILM / POST-PRODUCTION",code:"VIDEO",id:"nl-videos-910",description:"A sixty-second multitrack editorial cut with generated source proxies, titles, transitions and captions.",style:"film",icon:Clapperboard},
  {title:"Manifesto & portfolio",kind:"PRESENTATION / STORY",code:"PRESENT",id:"nl-decks-900",description:"A six-slide narrative for clients and collaborators, with native editable objects and speaker notes.",style:"deck",icon:Presentation},
  {title:"The living website",kind:"WEB / CONTENT EXPERIENCE",code:"WEB",id:"nl-sites-900",description:"Seven native editor pages, structured CMS records, responsive content and linked enquiry forms.",style:"web",icon:Globe2},
];

function findFlagship(records: Record<string,Rec[]>, id:string):Rec|undefined {
  const parts=id.split("-");
  const collection=parts[1];
  return (records[collection] ?? []).find(rec=>rec.id===id && rec.fields.flagship==="Northline Collective");
}
function openRecord(record:Rec|undefined,code:string,slug:string):string {
  if (!record) return appEntry(code,slug);
  const details:Record<string,string> = {
    sites:"web/sites", publications:"layout/publications", videos:"video/projects",
    photos:"photo/photos", forms:"forms/forms",
  };
  const target=details[record.collection];
  if(target){
    const tail=record.collection==="sites"?"/builder":"";
    return `/o/${slug}/${target}/${encodeURIComponent(record.id)}${tail}`;
  }
  return routeForRecord(record,slug) ?? appEntry(code,slug);
}
const paths=[
  {step:"01",name:"Acquire",note:"Customer brief → qualified opportunity",app:"CRM",id:"nl-deals-910"},
  {step:"02",name:"Create",note:"Creative concept → collaborative review",app:"DESIGN",id:"nl-designs-911"},
  {step:"03",name:"Operate",note:"Supply and project delivery",app:"PROJECT",id:"nl-projects-900"},
  {step:"04",name:"Grow",note:"Campaign drafts and customer experiences",app:"MARKET",id:"nl-campaigns-900"},
];

export default function FlagshipShowcase() {
  const {org,role}=useWorkspace();
  const records=useCollections(GROUPS);
  const flagshipCount=Object.values(records).flat().filter(record=>record.fields.flagship==="Northline Collective").length;
  const staff=(records.employees??[]).filter(record=>record.fields.flagship==="Northline Collective"&&record.id!=="nl-employees-900").length;
  const agents=(records.agents??[]).filter(record=>record.fields.flagship==="Northline Collective"&&record.id!=="nl-agents-900").length;
  const works=(records.projects??[]).filter(record=>record.fields.flagship==="Northline Collective").length;
  const monthly=(records.datasets??[])
    .filter(record=>record.fields.flagship==="Northline Collective" && record.fields.scenarioOnly===true && typeof record.fields.scenarioRevenueMinor==="number")
    .sort((a,b)=>String(a.fields.period).localeCompare(String(b.fields.period)));
  const revenueMinor=monthly.reduce((sum,record)=>sum+Number(record.fields.scenarioRevenueMinor),0);
  const commerceMinor=monthly.reduce((sum,record)=>sum+Number(record.fields.commerceMinor??0),0);
  const servicesMinor=monthly.reduce((sum,record)=>sum+Number(record.fields.servicesMinor??0),0);
  const experienceMinor=monthly.reduce((sum,record)=>sum+Number(record.fields.experienceMinor??0),0);
  const maxRevenue=Math.max(1,...monthly.map(record=>Number(record.fields.scenarioRevenueMinor)));
  const sterling=(minor:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(minor/100);

  if(org.slug!=="collective")return <div className="fs-access"><h1>This showcase is not in this organisation</h1><p>Northline Collective is only available in the existing Northline local demonstration workspace.</p><Link to={`/o/${org.slug}/workspace/home`}>Return to your workspace</Link></div>;
  if(role==="client")return <div className="fs-access"><h1>Internal showcase unavailable</h1><p>This fictional casefile and its internal records cannot be inspected in the Client role preview.</p><Link to={`/o/${org.slug}/workspace/home`}>Return to your workspace</Link></div>;
  return <div className="fs">
    <div className="fs-utility"><Link to={`/o/${org.slug}/workspace/home`}><ArrowLeft size={15}/> Back to workspace</Link><span>FICTIONAL COMPANY · BROWSER-LOCAL DEMONSTRATION</span></div>
    <header className="fs-hero">
      <div className="fs-hero-collage" aria-hidden="true">
        <span className="fs-paper fs-paper--back"/><span className="fs-paper fs-paper--violet"/>
        <span className="fs-paper fs-paper--graphite"/><span className="fs-paper fs-paper--vellum"/>
        <svg className="fs-collage-doodle" viewBox="0 0 500 500" fill="none">
          <path d="M41 243C131 111 312 124 373 220S361 405 251 373 172 245 266 224 388 292 320 322" stroke="#dfff3f" strokeWidth="7" strokeLinecap="round"/>
          <path d="M302 301L320 322 337 299" stroke="#dfff3f" strokeWidth="7" strokeLinecap="round"/>
        </svg>
        <span className="fs-slip fs-slip--top"><small>BRIEF / 001</small>Make room for the unexpected.</span>
        <span className="fs-slip fs-slip--bottom"><small>COLLECTIVE NOTE</small>Material is where the idea begins.</span>
      </div>
      <div className="fs-hero-content">
        <p className="fs-eyebrow">ARLOVI / THE FLAGSHIP BUSINESS</p>
        <h1>Northline<br/><em>Collective.</em></h1>
        <p className="fs-hero-description">Material. Space. Experience. A connected creative business, presented through the work it makes and the systems that move it forward.</p>
        <div className="fs-hero-actions">
          <a className="fs-primary" href="/northline-collective/index.html" target="_blank" rel="noopener noreferrer">Experience the website <ArrowUpRight size={17}/></a>
          <a className="fs-secondary" href="#creative-work">Explore native Studio <ArrowRight size={17}/></a>
          <a className="fs-secondary fs-film-link" href="/northline-collective/film.html" target="_blank" rel="noopener noreferrer">Watch original motion study <ArrowUpRight size={17}/></a>
        </div>
      </div>
      <div className="fs-hero-footer"><span>STRATEGY / DESIGN / COMMERCE / INTELLIGENCE</span><span>01 — 35 NATIVE APPLICATIONS</span></div>
    </header>
    <section className="fs-stat-strip" aria-label="Demonstration records currently loaded">
      <div><strong>{staff||"—"}</strong><span>Fictional employee profiles</span></div>
      <div><strong>{agents||"—"}</strong><span>AI specialist drafts</span></div>
      <div><strong>{works||"—"}</strong><span>Flagship projects</span></div>
      <div><strong>{flagshipCount||"—"}</strong><span>Loaded showcase records in tracked collections</span></div>
    </section>
    <section className="fs-scenario" aria-labelledby="fs-scenario-title">
      <div className="fs-scenario-heading"><div><span className="fs-overline">SCENARIO LAB / DEC 2025 — NOV 2026</span>
        <h2 id="fs-scenario-title">The business, <em>in numbers.</em></h2>
        <p>These are illustrative planning assumptions, not recognised revenue or posted accounting actuals. Every customer invoice and supplier bill in this scenario remains a local draft.</p></div>
        <div className="fs-scenario-total"><span>FICTIONAL ANNUAL REVENUE TARGET</span><strong>{monthly.length===12?sterling(revenueMinor):"Not loaded"}</strong><small>{monthly.length} of 12 planned periods in this browser</small></div></div>
      <div className="fs-scenario-body">
        <div className="fs-bars" role="img" aria-label={monthly.length===12?"Twelve-month fictional revenue scenario; figures range from "+sterling(Math.min(...monthly.map(record=>Number(record.fields.scenarioRevenueMinor))))+" to "+sterling(maxRevenue)+".":"Scenario data is not available in this workspace."}>
          {monthly.map(record=>{
            const amount=Number(record.fields.scenarioRevenueMinor);
            const month=String(record.fields.period).slice(-2);
            const label=new Date("2026-"+month+"-01T00:00:00Z").toLocaleString("en-GB",{month:"short"});
            return <div key={record.id} className="fs-bar-item"><span className="fs-bar-value">{sterling(amount)}</span>
              <div className="fs-bar-track"><div className="fs-bar-fill" style={{height:`${Math.round(amount/maxRevenue*100)}%`}}/></div>
              <span className="fs-bar-label">{label}</span></div>;
          })}
          {!monthly.length&&<p className="fs-scenario-empty">The scenario has not been loaded. Open the Northline workspace and refresh after seed reconciliation.</p>}
        </div>
        <div className="fs-scenario-division"><span className="fs-overline">THREE DESIGN DISCIPLINES / PLANNING MIX</span>
          <div><span>Supply / products</span><strong>{sterling(commerceMinor)}</strong></div>
          <div><span>Atelier / services</span><strong>{sterling(servicesMinor)}</strong></div>
          <div><span>Experiences</span><strong>{sterling(experienceMinor)}</strong></div>
          <p>Read-only simulation. Forecasts cannot be substituted for bank reconciliations, verified sales or issued invoices.</p>
          <Link to={appEntry("ANALYTICS",org.slug)}>Explore business intelligence <ArrowRight size={16}/></Link>
        </div>
      </div>
    </section>
    <section className="fs-intro"><span className="fs-overline">A COLLECTIVE, NOT A COLLECTION OF SOFTWARE</span><p>Every application is part of the same story. The customer brief informs the concept; the concept shapes the project; the project informs procurement, finance and the final customer experience.</p></section>
    <section id="creative-work" className="fs-work">
      <div className="fs-section-head"><div><span className="fs-overline">01 / A STUDIO WITH SUBSTANCE</span><h2>Built to <em>be explored.</em></h2></div><p>Open the actual editable source files in Arlovi. Each document is a locally stored draft—not a static screenshot or a claimed external publication.</p></div>
      <div className="fs-work-grid">
        {STUDIO.map((card,index)=>{
          const record=findFlagship(records,card.id);
          const Icon=card.icon;
          return <Link key={card.id} className={`fs-work-card fs-${card.style}`} to={openRecord(record,card.code,org.slug)}>
            <div className="fs-card-art" aria-hidden="true"><span className="fs-art-disc"/><span className="fs-art-line"/><span className="fs-art-type">N<span>°</span>{String(index+1).padStart(2,"0")}</span></div>
            <div className="fs-card-info"><span className="fs-card-type"><Icon size={15}/>{card.kind}</span><h3>{card.title}</h3><p>{card.description}</p><span className="fs-card-link">{record?"Open editable source":"Open native application"} <ArrowUpRight size={17}/></span></div>
          </Link>;
        })}
      </div>
    </section>
    <section className="fs-business">
      <div className="fs-section-head"><div><span className="fs-overline">02 / THE OPERATING STORY</span><h2>From enquiry to <em>outcome.</em></h2></div><p>Follow Lighthouse Hotels through connected business work. Live actions still require appropriate permissions and connected providers.</p></div>
      <div className="fs-lighthouse-feature"><div><span>CASEFILE / LIGHTHOUSE HOTELS / 45 ROOMS</span><h3>Follow the work.<br/><em>Not just the outcome.</em></h3>
        <p>Open a guided, record-backed project story: client brief, editable concept boards, documents, explicit approval gates, sourcing plans and commercial drafts. Nothing has been externally sent or approved.</p></div>
        <Link to={`/o/${org.slug}/workspace/showcase/lighthouse`}>Explore Lighthouse casefile <ArrowUpRight size={18}/></Link>
      </div>
      <div className="fs-journey">{paths.map((item,i)=>{
        const record=findFlagship(records,item.id);
        return <Link key={item.step} to={openRecord(record,item.app,org.slug)} className="fs-journey-step">
          <span className="fs-journey-index">{item.step}</span><div><h3>{item.name}</h3><p>{item.note}</p></div>
          <ArrowUpRight size={21}/>{i<paths.length-1&&<span aria-hidden="true" className="fs-journey-divider"/>}
        </Link>;
      })}</div>
    </section>
    <section className="fs-directories">
      <div><Sparkles size={25}/><h2>Intelligence with boundaries.</h2><p>Explore eighteen draft AI specialist contracts, an assisted company knowledge environment and missions that require authorisation. No fictional model runs are represented as completed execution.</p><Link to={appEntry("TEAM",org.slug)}>Open AI Workforce <ArrowRight size={16}/></Link></div>
      <div><BriefcaseBusiness size={25}/><h2>A business that holds together.</h2><p>Discover CRM opportunities, design projects, financial drafts, company people and the workflows connecting them—not merely isolated dashboard numbers.</p><Link to={appEntry("PROJECT",org.slug)}>Open Projects <ArrowRight size={16}/></Link></div>
      <div><Boxes size={25}/><h2>Products worth making.</h2><p>Follow considered lighting and furniture concepts through catalogue, sourcing, campaigns and order drafts. Payments and fulfilment connections are deliberately not invented.</p><Link to={appEntry("COMMERCE",org.slug)}>Open Commerce <ArrowRight size={16}/></Link></div>
      <div><Users size={25}/><h2>People behind the work.</h2><p>Explore a fictional workforce across creative, commercial and operational functions, with structured employee records and bounded AI assistance.</p><Link to={appEntry("HR",org.slug)}>Open People <ArrowRight size={16}/></Link></div>
    </section>
    <footer className="fs-foot"><p>Northline Collective is a fictional flagship reference, operating as its own fictional browser-local company, separately from the original Northline Atelier and Harbor Supply demonstrations.</p><Link to={`/o/${org.slug}/workspace/apps`}>Discover all native applications <ArrowRight size={16}/></Link></footer>
  </div>;
}
