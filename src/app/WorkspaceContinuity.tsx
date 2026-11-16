import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, Clock3, Trash2 } from "lucide-react";
import { findScreen } from "@/app/catalog";
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
      <span className="ws-continuity-meta">{new Date(item.visitedAt).toLocaleDateString()}</span>
    </Link>
    <button type="button" className="ws-continuity-action" onClick={onToggle} aria-label={saved ? `Unsave ${label}` : `Save ${label}`} title={saved ? "Remove saved location" : "Save location"}>{saved ? <BookmarkCheck size={17}/> : <Bookmark size={17}/>}</button>
    {onRemove && <button type="button" className="ws-continuity-action" onClick={onRemove} aria-label={`Remove ${label} from recent`} title="Remove from recent"><Trash2 size={16}/></button>}
  </div>;
}
export function WorkspaceContinuity({ compact = false }: { compact?: boolean }) {
  const { org } = useWorkspace();
  const { recent, pinned } = useNavigationContinuity(org.id, org.slug);
  const related = useCollections(["projects","departments"]);
  const projects = related.projects ?? [];
  const departments = related.departments ?? [];
  const available = recent.filter(item => item.path !== `/o/${org.slug}/workspace/home`);
  const pinnedItems = pinned.map(path => recent.find(item => item.path === path) ?? {path,visitedAt:new Date(0).toISOString()});
  const sorted = compact ? available.slice(0,5) : available.slice(0,12);
  const toggle = (path: string) => toggleSavedNavigation(org.id,org.slug,path);
  return <section className="ws-section ws-continuity" aria-label="Recent and saved work">
    <div className="ws-continuity-heading"><h2><Clock3 size={18}/> {compact ? "Pick up where you left off" : "Recent and saved work"}</h2>
      {!compact && available.length > 0 && <button className="ws-continuity-clear" type="button" onClick={() => clearRecentNavigation(org.id,org.slug)}>Clear recent</button>}
    </div>
    {pinnedItems.length > 0 && <section className="ws-continuity-list" aria-label="Saved places">
      <div className="ws-continuity-group">SAVED PLACES</div>
      {pinnedItems.slice(0,compact?4:24).map(item=><LocationRow key={item.path} item={item} saved label={destinationLabel(item.path,org.slug,projects,departments)} onToggle={() => toggle(item.path)}/>)}
    </section>}
    {sorted.length > 0 ? <section className="ws-continuity-list" aria-label="Recently visited">
      <div className="ws-continuity-group">RECENTLY VISITED</div>
      {sorted.map(item=><LocationRow key={item.path} item={item} saved={pinned.includes(item.path)}
        label={destinationLabel(item.path,org.slug,projects,departments)}
        onToggle={() => toggle(item.path)}
        onRemove={compact ? undefined : () => removeRecentNavigation(org.id,org.slug,item.path)}/>)}
    </section> : pinnedItems.length === 0 && <p className="ws-empty">Pages and workspaces you visit will appear here, so you can return to them quickly.</p>}
    {compact && <Link className="ws-continuity-all" to={`/o/${org.slug}/workspace/recent`}>View all recent work</Link>}
  </section>;
}
