import { useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, Clock3, Search, Trash2, ArrowUpRight } from "lucide-react";
import { findScreen } from "@/app/catalog";
import { APP_ENTRIES } from "@/app/nav";
import { readAppJourney } from "@/platform/appJourney";
import { resumableApps } from "@/app/recentAppWork";
import { useCollections, useWorkspace } from "@/platform/workspace";
import {
  clearRecentNavigation, removeRecentNavigation, toggleSavedNavigation,
  useNavigationContinuity, type NavigationItem,
} from "@/platform/navigationContinuity";
import "./workspace-continuity.css";

export function destinationLabel(path: string, slug: string, projects: { id: string; title: string }[], departments: { id: string; title: string }[]): string {
  const route = `/o/${slug}/workspace/`;
  if (path.startsWith(route)) {
    const segments = path.slice(route.length).split("/");
    if (segments[0] === "work" && segments[1] === "project" && segments[2]) return projects.find(p => p.id === segments[2])?.title ?? "Project workspace";
    if (segments[0] === "spaces" && segments[1] === "department" && segments[2]) return departments.find(d => d.id === segments[2])?.title ?? "Department workspace";
    const names: Record<string,string> = {home:"My Workspace",company:"Company Headquarters",spaces:"Spaces",work:"Work",apps:"Applications"};
    return names[segments[0]] ?? "Workspace";
  }
  return findScreen(path)?.screen.title ?? "Application page";
}
function LocationRow({ item, saved, label, onToggle, onRemove }: { item: NavigationItem; saved: boolean; label: string; onToggle: () => void; onRemove?: () => void }) {
  return <div className="ws-continuity-item">
    <Link className="ws-continuity-destination" to={item.path}>
      <span className="ws-continuity-name">{label}</span>
      <span className="ws-continuity-meta">{saved ? "Saved" : new Date(item.visitedAt).toLocaleDateString()}</span>
    </Link>
    <button type="button" className="ws-continuity-action" onClick={onToggle} aria-label={saved ? `Unsave ${label}` : `Save ${label}`} title={saved ? "Remove saved location" : "Save location"}>{saved ? <BookmarkCheck size={17}/> : <Bookmark size={17}/>}</button>
    {onRemove && <button type="button" className="ws-continuity-action" onClick={onRemove} aria-label={`Remove ${label} from recent`} title="Remove from recent"><Trash2 size={16}/></button>}
  </div>;
}
export function WorkspaceContinuity({ compact = false }: { compact?: boolean }) {
  const { org, role, actor } = useWorkspace();
  const [view, setView] = useState<"all" | "recent" | "saved">("all");
  const [query, setQuery] = useState("");
  const { recent, pinned } = useNavigationContinuity(org.id, org.slug);
  const journey = readAppJourney(`${org.id}:${role}:${actor}`, org.slug);
  const resume = resumableApps(journey, org.slug, role, compact ? 3 : 6);
  const related = useCollections(["projects","departments"]);
  const projects = related.projects ?? [];
  const departments = related.departments ?? [];
  const available = recent.filter(item => item.path !== `/o/${org.slug}/workspace/home`);
  const pinnedItems = pinned.map(path => recent.find(item => item.path === path) ?? {path,visitedAt:new Date(0).toISOString()});
  const sorted = compact ? available.slice(0,5) : available.slice(0,20);
  const matches = (item: NavigationItem) => destinationLabel(item.path,org.slug,projects,departments).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const visiblePinned = compact ? pinnedItems.slice(0,4) : pinnedItems.filter(matches);
  const visibleRecent = compact ? sorted : sorted.filter(matches);
  const showSaved = compact || view !== "recent";
  const showRecent = compact || view !== "saved";
  const toggle = (path: string) => toggleSavedNavigation(org.id,org.slug,path);
  const continued = resume.filter(item =>
    !query.trim() || `${item.title} ${item.page}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="ws-section ws-continuity" aria-label="Recent and saved work">
    <div className="ws-continuity-heading"><h2><Clock3 size={18}/> {compact ? "Pick up where you left off" : "Recent and saved work"}</h2>
      {!compact && available.length > 0 && <button className="ws-continuity-clear" type="button" onClick={() => clearRecentNavigation(org.id,org.slug)}>Clear recent</button>}
    </div>
    {continued.length > 0 && (compact || view !== "saved") && <nav className="ws-resume" aria-label="Resume native application work">
      <span className="ws-continuity-group ws-resume-title">CONTINUE IN YOUR APPLICATIONS</span>
      <div className="ws-resume-grid">
        {continued.map(item => {
          const Icon = APP_ENTRIES[item.code]?.icon;
          return <Link to={item.to} className="ws-resume-link" key={item.code}
            aria-label={`Continue ${item.title}: ${item.page}`}>
            <span className="ws-resume-icon">{Icon && <Icon size={19} aria-hidden="true"/>}</span>
            <span className="ws-resume-details"><strong>{item.title}</strong><small className="ds-truncate">{item.page}</small></span>
            <ArrowUpRight size={16} aria-hidden="true" className="ws-resume-arrow"/>
          </Link>;
        })}
      </div>
    </nav>}
    {!compact && <div className="ws-continuity-controls"><div className="ws-continuity-filters" aria-label="Filter recent work">{(["all","recent","saved"] as const).map(value => <button type="button" key={value} aria-pressed={view === value} onClick={() => setView(value)}>{value === "all" ? "All places" : value === "recent" ? "Recently visited" : "Saved"}</button>)}</div><label className="ws-continuity-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Search recent and saved places</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a place…"/></label></div>}
    {showSaved && visiblePinned.length > 0 && <section className="ws-continuity-list" aria-label="Saved places">
      <div className="ws-continuity-group">SAVED PLACES</div>
      {visiblePinned.map(item=><LocationRow key={item.path} item={item} saved label={destinationLabel(item.path,org.slug,projects,departments)} onToggle={() => toggle(item.path)}/>)}
    </section>}
    {showRecent && visibleRecent.length > 0 ? <section className="ws-continuity-list" aria-label="Recently visited">
      <div className="ws-continuity-group">RECENTLY VISITED</div>
      {visibleRecent.map(item=><LocationRow key={item.path} item={item} saved={pinned.includes(item.path)}
        label={destinationLabel(item.path,org.slug,projects,departments)}
        onToggle={() => toggle(item.path)}
        onRemove={compact ? undefined : () => removeRecentNavigation(org.id,org.slug,item.path)}/>)}
    </section> : showRecent && available.length === 0 && pinnedItems.length === 0 && <p className="ws-empty">Pages and workspaces you visit will appear here, so you can return to them quickly.</p>}
    {!compact && (query.trim() || view !== "all") && (showSaved ? visiblePinned.length === 0 : true) && (showRecent ? visibleRecent.length === 0 : true) && <p className="ws-empty">No matching places in this view. Try a different search or filter.</p>}
    {compact && <Link className="ws-continuity-all" to={`/o/${org.slug}/workspace/recent`}>View all recent work</Link>}
  </section>;
}
