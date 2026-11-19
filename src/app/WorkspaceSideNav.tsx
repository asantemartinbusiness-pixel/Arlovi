import { NavLink, useLocation } from "react-router-dom";
import {
  Activity, Bot, Building2, CalendarDays, CheckSquare2, Clock3, FileText,
  FolderKanban, Grid2X2, Home, Inbox, Layers, LockKeyhole, MessageSquare,
  Rocket, Settings2, Users, Workflow,
} from "lucide-react";
import { appEntry } from "@/app/catalog";
import { resumeNativeAppPath } from "@/app/resumeNativeApp";
import { NAV_GROUPS } from "@/app/nav";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { canOpen } from "@/platform/policy";
import { workspaceDestination, workspaceDetailPath, workspaceSectionPath } from "@/app/workspaceSidebarModel";
import type { ComponentType } from "react";
import type { Rec } from "@/domain/types";

type NavItem = { label: string; to: string; icon: ComponentType<{ size?:number;strokeWidth?:number }>; end?: boolean };
function SidebarGroup({ label, items }: { label?: string; items: NavItem[] }) {
  if (!items.length) return null;
  return <div className="ws-side-group">
    {label && <div className="hq-navsection">{label}</div>}
    {items.map(item => <NavLink key={item.to} to={item.to} end={item.end ?? true}
      className={({isActive}) => `hq-navlink${isActive?" ws-side-selected":""}`}
      aria-label={item.label} title={item.label}>
      <item.icon size={16} aria-hidden="true"/>
      <span className="ds-truncate">{item.label}</span>
    </NavLink>)}
  </div>;
}
function sidebarLinks(slug:string) {
  const link = (section:"home"|"company"|"spaces"|"work"|"apps"|"recent"|"resources"|"people"|"account"|"health",
    label:string,icon:NavItem["icon"]):NavItem=>({label,to:workspaceSectionPath(slug,section),icon});
  return {link};
}
/** A contextual secondary navigation: the primary rail owns the five top areas. */
export function WorkspaceSideNav() {
  const {org,role,actor} = useWorkspace();
  const location = useLocation();
  const destination = workspaceDestination(location.pathname);
  const area = destination?.area ?? "home";
  const {link} = sidebarLinks(org.slug);
  const { departments=[],projects=[] } = useCollections(["departments","projects"]);
  const parts = location.pathname.split("/");
  const kind = parts[5] === "department" || parts[5] === "project" ? parts[5] : null;
  const record = kind === "department" ? departments.find(r => r.id===parts[6])
    : kind === "project" ? projects.find(r => r.id===parts[6]) : null;
  const detailTitle = record?.title;
  const descriptor = detailTitle ? (kind === "department"?"Department workspace":"Project workspace") : destination?.description ?? "";
  const title = detailTitle ?? destination?.title ?? "My Workspace";
  const workspace = [
    link("home","Overview",Home),link("recent","Recent & saved",Clock3),
    {label:"My tasks & projects",to:workspaceSectionPath(org.slug,"work"),icon:CheckSquare2},
  ];
  const company = [
    link("company","Company overview",Building2),link("people","People & collaboration",Users),
    link("account","Account & data",LockKeyhole),link("health","Workspace health",Activity),
  ];
  const spaces = [
    link("spaces","All departments",Layers),link("resources","Files & resources",FolderKanban),
  ];
  const work = [
    link("work","Work overview",FolderKanban),
  ];
  const apps = [link("apps","Browse all applications",Grid2X2)];
  const main = area==="home"?workspace:area==="company"?company:area==="spaces"?spaces:area==="work"?work:apps;
  const appShortcut=(code:string,label:string,icon:NavItem["icon"]):NavItem|null=>
    canOpen(role,code)?{label,to:resumeNativeAppPath(org.id,org.slug,actor,role,code),icon}:null;
  const shortcuts:NavItem[] = (area==="home"
    ? [appShortcut("INBOX","Inbox",Inbox),appShortcut("BOOK","Calendar & bookings",CalendarDays)]
    : area==="company"
      ? [appShortcut("HQ","Executive headquarters",Building2),appShortcut("ADMIN","Administration",Settings2),appShortcut("HR","People application",Users)]
      : area==="spaces"
        ? [appShortcut("COMMS","Communications",MessageSquare),appShortcut("DOCS","Documents",FileText)]
        : area==="work"
          ? [appShortcut("PROJECT","Project management",CheckSquare2),appShortcut("MISSION","Mission Control",Rocket),appShortcut("AUTO","Automation",Workflow)]
          : []).filter((item):item is NavItem=>Boolean(item));
  const records:Rec[] = area==="spaces"?departments:area==="work"?projects:[];
  const recordGroup:NavItem[] = records.slice(0,8).map(r=>({
    label:r.title,to:workspaceDetailPath(org.slug,area==="spaces"?"department":"project",r.id),
    icon:area==="spaces"?Building2:FolderKanban,
  }));
  const detailRoot=kind && record ? workspaceDetailPath(org.slug,kind,record.id):null;
  const scopedNavigation:NavItem[] = detailRoot?[
    {label:"Overview",to:detailRoot,icon:Home},
    {label:"Tasks & work",to:`${detailRoot}?tab=work`,icon:CheckSquare2},
    {label:"AI workforce",to:`${detailRoot}?tab=ai%20workforce`,icon:Bot},
    {label:"People",to:`${detailRoot}?tab=people`,icon:Users},
    {label:"Files",to:`${detailRoot}?tab=files`,icon:FolderKanban},
    {label:"Conversations",to:`${detailRoot}?tab=conversations`,icon:MessageSquare},
    {label:"Approvals",to:`${detailRoot}?tab=approvals`,icon:CheckSquare2},
    {label:"Activity",to:`${detailRoot}?tab=activity`,icon:Activity},
  ]:[];
  const sectionLabel = area==="home"?"MY DAY":area==="company"?"ORGANISATION":area==="spaces"?"WORKSPACES":area==="work"?"DELIVERY":"APPLICATIONS";
  const currentDetailTab = new URLSearchParams(location.search).get("tab") ?? "overview";
  return <nav className="hq-appnav ws-sidebar" aria-label={title+" navigation"}>
    <div className="hq-appnav-head"><h2 title={title}>{title}</h2><p>{descriptor}</p></div>
    <div className="hq-appnav-body">
      {detailRoot && <>
        <div className="ws-side-back"><NavLink to={workspaceSectionPath(org.slug,area)}><span aria-hidden="true">←</span> {area==="spaces"?"All departments":"All work"}</NavLink></div>
        <div className="ws-side-group"><div className="hq-navsection">THIS SPACE</div>
          {scopedNavigation.map(item=>{
            const selected = item.to.includes("?tab=") ? currentDetailTab===new URLSearchParams(item.to.split("?")[1]).get("tab") : currentDetailTab==="overview";
            return <NavLink key={item.to} to={item.to} className={`hq-navlink${selected?" ws-side-selected":""}`} aria-current={selected?"page":undefined}>
              <item.icon size={16} aria-hidden="true"/><span className="ds-truncate">{item.label}</span>
            </NavLink>;
          })}
        </div>
      </>}
      {!detailRoot && <SidebarGroup label={sectionLabel} items={main}/>}
      {recordGroup.length>0 && <SidebarGroup label={area==="spaces"?"DEPARTMENTS":"PROJECTS"} items={recordGroup}/>}
      {area==="apps" && <div className="ws-side-app-groups" aria-label="Native application categories">
        {NAV_GROUPS.map(group=>{
          const options = group.apps.filter(a=>canOpen(role,a.code))
            .map(a=>({label:a.short,to:appEntry(a.code,org.slug),icon:a.icon}));
          if (!options.length) return null;
          return <details key={group.label} className="ws-side-app-group">
            <summary>{group.label}<span aria-hidden="true">{options.length}</span></summary>
            <SidebarGroup items={options}/>
          </details>;
        })}
      </div>}
      {shortcuts.length>0 && <SidebarGroup label="TOOLS" items={shortcuts}/>}
      {(area==="home" || area==="company") && <div className="ws-side-footnote">
        {area==="home"?"Switch areas using the icon rail. Recent work stays within this company.":"Company settings and access planning are local until cloud accounts are configured."}
      </div>}
    </div>
  </nav>;
}
