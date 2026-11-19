import { useState, type FormEvent } from "react";
import { ArrowRight, ArrowUpRight, Menu, X } from "lucide-react";
import { Link } from "react-router-dom";
import { db } from "@/runtime/db";
import { ORG_COLLECTIVE } from "@/domain/types";
import { clockIso } from "@/platform/clock";
import type { Rec, Audit } from "@/domain/types";
import "./northline-showcase.css";

type Filter = "All work" | "Spaces" | "Objects" | "Experiences";
const NAV = [["Work", "#work"], ["Collective", "#collective"], ["Journal", "#journal"], ["Contact", "#contact"]] as const;
const WORK = [
  { number:"01", title:"Lighthouse", descriptor:"A softer kind of arrival.", type:"Spaces", name:"Hospitality / Manchester", art:"lighthouse" },
  { number:"02", title:"Cove", descriptor:"The poetry of restraint.", type:"Objects", name:"Lighting / Collection 01", art:"cove" },
  { number:"03", title:"The Alder House", descriptor:"A home with room to breathe.", type:"Spaces", name:"Residential / London", art:"alder" },
  { number:"04", title:"Material Conversations", descriptor:"The pleasure of making.", type:"Experiences", name:"Studio / Manchester", art:"materials" },
] as const;

function Sculpture({ variant = "hero" }: { variant?: "hero" | "cove" | "lighthouse" | "alder" | "materials" }) {
  const isHero = variant === "hero";
  const shade = variant === "alder" ? "#777E70" : variant === "lighthouse" ? "#B7845E" : "#B36E48";
  return (
    <svg className={isHero ? "nc-sculpture nc-sculpture-hero" : "nc-sculpture"} viewBox="0 0 640 720"
      role="img" aria-label={isHero ? "Original sculptural rendering of a copper pendant and its cast shadow" : `Original abstract illustration for ${variant}`}>
      <defs>
        <radialGradient id={`nc-glow-${variant}`} cx="50%" cy="55%" r="58%">
          <stop offset="0%" stopColor="#F8E7C0" stopOpacity=".95" />
          <stop offset="70%" stopColor="#C6A682" stopOpacity=".25" />
          <stop offset="100%" stopColor="#C6A682" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`nc-metal-${variant}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#DBB18B"/><stop offset="25%" stopColor={shade}/>
          <stop offset="58%" stopColor="#85533E"/><stop offset="100%" stopColor="#E2B68B"/>
        </linearGradient>
        <filter id={`nc-soft-${variant}`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="26"/>
        </filter>
      </defs>
      <ellipse cx="340" cy="620" rx="240" ry="45" fill="#211F1B" opacity=".16" filter={`url(#nc-soft-${variant})`}/>
      <circle cx="342" cy="355" r="248" fill={`url(#nc-glow-${variant})`}/>
      <g className="nc-sculpture-art">
        <line x1="330" y1="0" x2="330" y2="190" stroke="#4A3E35" strokeWidth="3"/>
        <path d="M208 265 C211 214 249 179 330 179 C411 179 449 214 452 265 L484 400 C486 419 452 440 330 441 C208 440 174 419 176 400 Z"
          fill={`url(#nc-metal-${variant})`} stroke="#805741" strokeWidth="2"/>
        <path d="M177 398 C250 432 407 430 483 398 C458 466 207 473 177 398"
          fill="#332923" opacity=".9"/>
        <ellipse cx="330" cy="407" rx="94" ry="26" fill="#FFE9C4" opacity=".8"/>
        <ellipse cx="330" cy="437" rx="150" ry="20" fill="#DEAC76" opacity=".28" filter={`url(#nc-soft-${variant})`}/>
        <path d="M330 441v129" stroke="#332E2B" strokeOpacity=".22" strokeWidth="2"/>
      </g>
      <g className="nc-art-stamp" fill="#2A2824" opacity=".62" fontFamily="monospace" fontSize="12" letterSpacing="2">
        <text x="36" y="655">STUDY / 01</text><text x="36" y="677">FORM IN LIGHT</text>
      </g>
    </svg>
  );
}

function EditorialMark() {
  return <span className="nc-brand-mark" aria-hidden="true"><span>N</span><span className="nc-brand-dot"/></span>;
}

function GalleryArt({ art }: { art: typeof WORK[number]["art"] }) {
  if (art === "cove") return <Sculpture variant="cove" />;
  if (art === "lighthouse") return <svg className="nc-scene-art nc-scene-lighthouse" viewBox="0 0 800 620"
    role="img" aria-label="Original architectural drawing of a calm hotel interior with broad limestone archways">
    <defs>
      <linearGradient id="nc-lh-wall" x1="0" y1="0" x2="0.8" y2="1">
        <stop stopColor="#d7d1c4"/><stop offset="1" stopColor="#989185"/>
      </linearGradient>
      <linearGradient id="nc-lh-floor" x1="0" y1="0" x2="1" y2=".7">
        <stop stopColor="#b6ab98"/><stop offset="1" stopColor="#897d6e"/>
      </linearGradient>
      <filter id="nc-lh-blur"><feGaussianBlur stdDeviation="16"/></filter>
    </defs>
    <rect width="800" height="620" fill="url(#nc-lh-wall)"/>
    <path d="M0 450L800 420V620H0Z" fill="url(#nc-lh-floor)"/>
    <rect x="143" y="66" width="506" height="395" rx="250" fill="#6e7069"/>
    <rect x="181" y="104" width="429" height="358" rx="212" fill="#c5c0b4"/>
    <path d="M221 465V310A174 174 0 0 1 569 310V465" fill="#848879"/>
    <path d="M260 466V312A134 134 0 0 1 529 312V466" fill="#c8c2ae"/>
    <path d="M301 462V333A93 93 0 0 1 488 333V462" fill="#e0d4b9"/>
    <path d="M349 462V339A45 45 0 0 1 439 339V462" fill="#8f8e7e"/>
    <ellipse cx="398" cy="476" rx="185" ry="18" fill="#443a32" opacity=".27" filter="url(#nc-lh-blur)"/>
    <path d="M183 427Q191 390 240 392H544Q592 390 598 427V478H183Z" fill="#b6ab94"/>
    <rect x="192" y="449" width="395" height="39" rx="13" fill="#8d8576"/>
    <rect x="220" y="476" width="17" height="48" fill="#61584c"/>
    <rect x="546" y="476" width="17" height="48" fill="#61584c"/>
    <rect x="380" y="485" width="10" height="80" fill="#6d594b"/>
    <ellipse cx="386" cy="478" rx="67" ry="10" fill="#a28164"/>
    <path d="M385 70V243" stroke="#302d29" strokeWidth="2"/>
    <path d="M334 259Q332 231 385 226Q437 232 434 259L447 305Q391 326 321 305Z" fill="#9a6648"/>
    <ellipse cx="385" cy="307" rx="63" ry="8" fill="#40362e"/>
    <text x="35" y="578" fill="#49483f" fontSize="12" fontFamily="monospace" letterSpacing="3">LIGHTHOUSE / HOSPITALITY STUDY</text>
  </svg>;
  if (art === "alder") return <svg className="nc-scene-art nc-scene-alder" viewBox="0 0 800 620"
    role="img" aria-label="Original modern residential interior illustration with sculptural seating and an olive arch">
    <defs><linearGradient id="nc-alder-wall" x1=".2" y1="0" x2=".7" y2="1">
      <stop stopColor="#d6d1bf"/><stop offset="1" stopColor="#abb09e"/></linearGradient>
      <linearGradient id="nc-alder-ground" x1="0" y1="0" x2="1" y2="1">
      <stop stopColor="#d8c5a9"/><stop offset="1" stopColor="#a58f77"/></linearGradient></defs>
    <rect width="800" height="620" fill="url(#nc-alder-wall)"/>
    <path d="M0 455H800V620H0Z" fill="url(#nc-alder-ground)"/>
    <path d="M134 460V186Q134 72 258 72H550Q662 73 662 186V460Z" fill="#7e8979"/>
    <path d="M173 461V182Q173 105 262 105H550Q622 106 622 182V461Z" fill="#bec3b0"/>
    <path d="M401 106V463M173 268H621" stroke="#7a8677" strokeWidth="10" opacity=".58"/>
    <path d="M105 470Q105 388 182 388H533Q607 389 608 470V513H105Z" fill="#eee3cb"/>
    <path d="M107 483Q320 470 609 483V520Q386 543 107 520Z" fill="#c0af91"/>
    <path d="M135 511V540M575 511V540" stroke="#806f60" strokeWidth="12"/>
    <ellipse cx="515" cy="562" rx="176" ry="20" fill="#837362" opacity=".18"/>
    <ellipse cx="518" cy="531" rx="120" ry="32" fill="#7c5540"/>
    <path d="M476 545V581M562 545V580" stroke="#4e392d" strokeWidth="13"/>
    <path d="M676 481L668 284" stroke="#5a5c45" strokeWidth="6"/>
    <path d="M668 335Q623 304 645 265Q688 293 668 335M665 366Q712 341 722 303Q672 315 665 366" fill="#78836c"/>
    <rect x="652" y="479" width="48" height="50" rx="3" fill="#b68d70"/>
    <text x="35" y="582" fill="#45483e" fontSize="12" fontFamily="monospace" letterSpacing="3">ALDER / RESIDENTIAL STUDY</text>
  </svg>;
  return <svg className="nc-scene-art nc-scene-materials" viewBox="0 0 800 620"
    role="img" aria-label="Original editorial still-life illustration of ceramic forms, fabric and colour swatches">
    <defs>
      <linearGradient id="nc-material-paper" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#dfd2bd"/><stop offset="1" stopColor="#b5a68e"/></linearGradient>
      <linearGradient id="nc-material-ceramic" x1="0" y1="0" x2="1" y2=".8">
        <stop stopColor="#dcb18d"/><stop offset=".6" stopColor="#a96f51"/><stop offset="1" stopColor="#714e39"/></linearGradient>
    </defs>
    <rect width="800" height="620" fill="#d4c7b3"/>
    <path d="M0 48L647 0L801 620L210 620Z" fill="url(#nc-material-paper)"/>
    <path d="M70 620L0 310L348 124L510 620Z" fill="#b6b9a2"/>
    <path d="M107 620L38 341L329 183L462 620Z" fill="#dad5c5"/>
    <path d="M172 620L120 366L312 271L402 620Z" fill="#aaa694"/>
    <ellipse cx="552" cy="523" rx="144" ry="32" fill="#615447" opacity=".17"/>
    <path d="M444 226Q452 180 508 185H613Q675 191 677 238L647 478Q612 537 511 507L459 480Z" fill="url(#nc-material-ceramic)"/>
    <ellipse cx="561" cy="227" rx="113" ry="24" fill="#6f4c39"/>
    <ellipse cx="562" cy="229" rx="75" ry="13" fill="#d9bca2"/>
    <rect x="437" y="515" width="257" height="12" rx="5" fill="#5b5147"/>
    <path d="M84 92H336" stroke="#847767" strokeWidth="3"/>
    <text x="82" y="79" fontFamily="monospace" fontSize="13" letterSpacing="3" fill="#46453c">MATERIAL NOTE / 004</text>
    <text x="49" y="576" fontSize="12" fontFamily="monospace" letterSpacing="3" fill="#49483f">SAMPLES / IN PROGRESS</text>
  </svg>;
}

function ArtCard({ art }: { art: typeof WORK[number]["art"] }) {
  return <div className={`nc-work-art nc-work-art-${art}`}>
    <div className="nc-work-art-grid" aria-hidden="true"/>
    <GalleryArt art={art}/>
    <span className="nc-art-index" aria-hidden="true">NORTHLINE / 2026</span>
  </div>;
}

export default function NorthlineShowcase() {
  const [menu, setMenu] = useState(false);
  const [filter, setFilter] = useState<Filter>("All work");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [request, setRequest] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<"idle"|"saving"|"saved"|"error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(status==="saving" || !name.trim() || !email.trim() || !request.trim() || !consent)return;
    setStatus("saving");
    const now = clockIso();
    const key = crypto.randomUUID();
    const contactId = `nc-web-contact-${key}`;
    const leadId = `nc-web-lead-${key}`;
    const common = {
      organizationId: ORG_COLLECTIVE, status:"new",ownerName:"Sales Studio",
      currency:"GBP",at:now,createdAt:now,updatedAt:now,revision:1,
      createdBy:"Northline showcase (local)",updatedBy:"Northline showcase (local)",
      history:[],tags:["flagship","local-enquiry","consent-recorded"],
    };
    const contact: Rec = { ...common,id:contactId,collection:"contacts",
      title:name.trim().slice(0,100),summary:"Submitted from flagship editorial preview.",
      fields:{email:email.trim().slice(0,160),source:"flagship-preview",
        consentContact:true,consentMarketing:false} };
    const lead: Rec = { ...common,id:leadId,collection:"leads",
      title:`Portfolio enquiry · ${name.trim().slice(0,80)}`,
      summary:request.trim().slice(0,1800),parentId:contactId,
      fields:{contactId,source:"flagship-preview",delivery:"ready_local",
        externallySent:false} };
    const audit: Audit = {id:`evt-nc-web-${key}`,organizationId:ORG_COLLECTIVE,
      at:now,actor:"Northline showcase (local)",type:"demo.enquiry_created",
      entityId:leadId,message:"Visitor-created local enquiry. No email or external CRM service was contacted.",
      capability:"ready_local"};
    try {
      await db.transaction("rw",[db.records,db.events],async()=>{
        await db.records.bulkAdd([contact,lead]);await db.events.add(audit);
      });
      setName("");setEmail("");setRequest("");setConsent(false);setStatus("saved");
    } catch {
      setStatus("error");
    }
  }

  const visible = WORK.filter(item=>filter==="All work" || item.type===filter);
  return <main className="nc-page">
    <div className="nc-demo-bar">NORTHLINE COLLECTIVE <span aria-hidden="true">·</span> FICTIONAL FLAGSHIP / BUILT TO EXPLORE ARLOVI <Link to="/o/collective/hq/home">Open business workspace <ArrowUpRight size={13}/></Link></div>
    <header className="nc-header">
      <a href="#top" className="nc-brand" aria-label="Northline Collective, top of page"><EditorialMark/><span>northline<span className="nc-brand-secondary">collective.</span></span></a>
      <nav className={menu?"nc-nav nc-nav-open":"nc-nav"} aria-label="Main navigation">
        {NAV.map(([label,href])=><a key={href} href={href} onClick={()=>setMenu(false)}>{label}</a>)}
        <a className="nc-nav-cta" href="#contact" onClick={()=>setMenu(false)}>Start something <ArrowUpRight size={15}/></a>
      </nav>
      <button type="button" className="nc-menu" aria-expanded={menu} aria-label={menu?"Close menu":"Open menu"}
        onClick={()=>setMenu(!menu)}>{menu?<X/>:<Menu/>}</button>
    </header>

    <section className="nc-hero" id="top" aria-labelledby="nc-hero-title">
      <div className="nc-hero-copy">
        <p className="nc-eyebrow"><span className="nc-eyebrow-rule"/> A CREATIVE HOUSE / MANCHESTER & LONDON</p>
        <h1 id="nc-hero-title">Spaces worth <em>staying in.</em></h1>
        <p className="nc-hero-intro">A collective for thoughtful spaces, enduring objects and experiences that stay with you.</p>
        <a className="nc-circle-link" href="#work" aria-label="Explore our selected work"><span>Explore our work</span><span className="nc-circle-arrow"><ArrowUpRight size={23}/></span></a>
      </div>
      <div className="nc-hero-art">
        <div className="nc-hero-art-surface" aria-hidden="true"/>
        <Sculpture/>
        <p className="nc-hero-art-label">OBJECT STUDY NO. 01 <span>LIGHT AS A MATERIAL</span></p>
      </div>
      <div className="nc-hero-folio"><span>01 — 04</span><span>SCROLL TO DISCOVER</span></div>
    </section>

    <section className="nc-intro" id="collective">
      <div className="nc-section-meta"><span>01 / THE COLLECTIVE</span><span>AN INDEPENDENT POINT OF VIEW</span></div>
      <div className="nc-intro-layout"><h2>Designed for <em>the way we live.</em></h2>
        <div><p>Beautiful things are not enough. We believe the best spaces and objects invite us to slow down, stay longer, and feel more at home.</p>
          <p>Across interiors, collections and intimate experiences, we make the considered feel effortless.</p>
          <a className="nc-text-link" href="#disciplines">Discover our disciplines <ArrowUpRight size={18}/></a>
        </div></div>
    </section>

    <section className="nc-disciplines" id="disciplines">
      <div className="nc-section-meta"><span>02 / OUR PRACTICE</span><span>THREE WORLDS. ONE LANGUAGE.</span></div>
      <div className="nc-discipline-grid">
        {[
          {n:"01",label:"ATELIER",headline:"Spaces with a point of view.",detail:"Interiors, lighting and environments with an enduring sense of place.",href:"#work"},
          {n:"02",label:"HARBOR SUPPLY",headline:"Objects with intention.",detail:"Sculptural, useful pieces that grow more beautiful through living.",href:"#work"},
          {n:"03",label:"EXPERIENCES",headline:"The pleasure of being here.",detail:"Consultations, workshops and gatherings centred on craft and curiosity.",href:"#contact"},
        ].map(d=><a href={d.href} className="nc-discipline" key={d.n}>
          <span className="nc-discipline-number">{d.n} / {d.label}</span><h3>{d.headline}</h3><p>{d.detail}</p>
          <span className="nc-discipline-arrow"><ArrowUpRight size={22}/></span></a>)}
      </div>
    </section>

    <section className="nc-work" id="work">
      <div className="nc-section-meta"><span>03 / SELECTED WORK</span><span>AN EDIT OF THE THINGS THAT MATTER</span></div>
      <div className="nc-work-head"><h2>A collection of <em>intentions.</em></h2>
        <div className="nc-filters" role="group" aria-label="Filter selected work">
          {(["All work","Spaces","Objects","Experiences"] as const).map(item=>
            <button key={item} className={filter===item?"nc-filter nc-filter-active":"nc-filter"}
              type="button" aria-pressed={filter===item} onClick={()=>setFilter(item)}>{item}</button>)}
        </div>
      </div>
      <div className="nc-work-grid">
        {visible.map(work=><article className="nc-work-card" key={work.number}>
          <ArtCard art={work.art}/><div className="nc-work-caption">
            <span>{work.number} / {work.name}</span><h3>{work.title}</h3><p>{work.descriptor}</p>
          </div></article>)}
      </div>
    </section>

    <section className="nc-manifesto" id="journal">
      <div className="nc-manifesto-orbit" aria-hidden="true"><span/></div>
      <p className="nc-eyebrow">THE NORTHLINE NOTE / NO. 001</p>
      <h2>Material first.<br/><em>Feeling always.</em></h2>
      <p>Good design asks the right questions. What lasts? What belongs? What will feel as right in ten years as it does today?</p>
      <span className="nc-manifesto-folio">AN EXERCISE IN RESTRAINT — 2026</span>
    </section>

    <section className="nc-contact" id="contact">
      <div className="nc-section-meta"><span>04 / START A CONVERSATION</span><span>MANCHESTER / LONDON</span></div>
      <div className="nc-contact-layout">
        <div><h2>What shall we <em>make together?</em></h2>
          <p>Have an idea for a place, an object, or an experience? Tell us what you're imagining.</p>
          <p className="nc-demo-disclosure">This is a fictional Arlovi showcase. Your enquiry will be stored in this browser's Northline Collective CRM sample; it will not be emailed or shared externally.</p>
        </div>
        <form className="nc-form" onSubmit={submit}>
          <label>01 / YOUR NAME<input value={name} onChange={e=>setName(e.target.value)}
            maxLength={100} placeholder="How should we address you?" required/></label>
          <label>02 / YOUR EMAIL<input value={email} onChange={e=>setEmail(e.target.value)}
            maxLength={160} type="email" placeholder="you@example.com" required/></label>
          <label>03 / YOUR IDEA<textarea value={request} onChange={e=>setRequest(e.target.value)}
            maxLength={1800} placeholder="Tell us a little about what you're imagining…" rows={4} required/></label>
          <label className="nc-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/>
            <span>I understand this is a browser-local demo and agree to save these details in the sample workspace.</span></label>
          <button className="nc-submit" type="submit" disabled={status==="saving"}>
            {status==="saving"?"Saving locally…":"Save enquiry in Arlovi"}<ArrowRight size={22}/></button>
          {status==="saved"&&<p className="nc-form-status" role="status">Saved locally. Your enquiry is now in the Northline Collective CRM sample.</p>}
          {status==="error"&&<p className="nc-form-status nc-form-error" role="alert">The browser could not save the enquiry. Check local storage permissions and retry.</p>}
        </form>
      </div>
    </section>
    <footer className="nc-footer">
      <div className="nc-footer-top"><EditorialMark/><span>Spaces worth staying in.</span>
        <a href="#top">Back to top ↑</a></div>
      <div className="nc-footer-bottom"><span>© 2026 NORTHLINE COLLECTIVE · FICTIONAL DESIGN CONCEPT</span>
        <span>ART DIRECTION / ARLOVI FLAGSHIP STUDIO</span>
        <Link to="/o/collective/workspace/apps">Explore the 35 applications <ArrowUpRight size={14}/></Link></div>
    </footer>
  </main>;
}
