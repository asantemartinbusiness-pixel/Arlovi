import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Clock3, FileClock, History, Search } from "lucide-react";
import { routeForRecord } from "@/platform/attention";
import type { Rec } from "@/domain/types";
import "./workspace-activity.css";

type Props={record:Rec;linked:Rec[];slug:string;fallback:string};
export function WorkspaceActivity({record,linked,slug,fallback}:Props){
  const [query,setQuery]=useState("");
  const [view,setView]=useState<"all"|"space"|"linked">("all");
  const events=useMemo(()=>{
    const records=(view==="space"?[record]:view==="linked"?linked:[record,...linked]);
    return records.flatMap(item=>[
      {id:item.id+":current",record:item,at:item.updatedAt,title:item.title,description:item.updatedBy?`Latest update by ${item.updatedBy}`:"Latest record update",status:item.status,current:true},
      ...item.history.map((snap,index)=>({id:item.id+":history:"+index,record:item,at:snap.at,title:snap.title,description:"Previous saved record state",status:snap.status,current:false}))
    ]).filter(event=>`${event.title} ${event.description} ${event.status} ${event.record.collection}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
      .sort((a,b)=>b.at.localeCompare(a.at)).slice(0,60);
  },[record,linked,view,query]);
  return <section className="wa" aria-label="Workspace record activity">
    <header className="wa-head"><div><span className="ws-detail-kicker">WORKSPACE / RECORD HISTORY</span><h2>Activity & changes</h2><p>Follow updates and saved revisions of this space and its linked records. This is record history, not the complete organisation audit log.</p></div><History size={23} aria-hidden="true"/></header>
    <div className="wa-metrics"><div><span>Linked records</span><strong>{linked.length}</strong></div><div><span>Space revisions</span><strong>{record.revision}</strong></div><div><span>Last updated</span><strong className="wa-date">{new Date(record.updatedAt).toLocaleDateString()}</strong></div></div>
    <div className="wa-panel"><div className="wa-controls"><div className="wa-filters" role="group" aria-label="Activity filter">{([["all","All activity"],["space","This space"],["linked","Linked work"]] as const).map(([value,label])=><button key={value} type="button" aria-pressed={view===value} onClick={()=>setView(value)}>{label}</button>)}</div><label className="wa-search"><Search size={16}/><span className="wa-sr-only">Search record activity</span><input type="search" placeholder="Search activity…" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
    <div className="wa-timeline">{events.length?events.map(event=><div className="wa-event" key={event.id}><span className="wa-event-icon">{event.current?<Clock3 size={17}/>:<FileClock size={17}/>}</span><div className="wa-event-body"><div><strong>{event.title}</strong><span>{event.record.collection.replace(/_/g," ")}</span></div><p>{event.description} · {event.status.replace(/_/g," ")}</p><small>{new Date(event.at).toLocaleString()}</small>{routeForRecord(event.record,slug)&&<Link to={routeForRecord(event.record,slug)!}>Open record <ArrowRight size={14}/></Link>}</div></div>):<div className="wa-empty"><History size={23}/><strong>No matching record history</strong><p>Try a different filter. Activity appears when these records are updated.</p></div>}</div></div>
    <p className="wa-note">Saved snapshots show prior record states. For the full audit history, open the source record or appropriate administration tools.</p><Link className="wa-back" to={routeForRecord(record,slug)??fallback}>Open source record <ArrowRight size={15}/></Link>
  </section>;
}
