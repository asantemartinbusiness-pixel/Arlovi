import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronRight, FolderKanban, Users, FileText, BriefcaseBusiness } from "lucide-react";
import { useCollections, useWorkspace } from "@/platform/workspace";
import { appEntry, findScreen } from "@/app/catalog";
import { workspaceDestination } from "@/app/workspaceSidebarModel";
import "./header-context.css";

export interface HeaderContext {
  section: string;
  title: string;
  parent?: { title: string; to: string };
  action?: { title: string; to: string };
}
export function resolveHeaderContext(
  path: string, slug: string, search: string,
  projects: {id:string;title:string}[], departments: {id:string;title:string}[],
): HeaderContext | null {
  const workspace = workspaceDestination(path);
  const segment = path.split("/");
  const detail = segment[5] === "project" || segment[5] === "department" ? segment[5] : null;
  if (workspace && detail) {
    const project = detail === "project";
    const record = (project ? projects : departments).find(item => item.id === segment[6]);
    const parent = project ? "Work" : "Spaces";
    const section = new URLSearchParams(search).get("tab") ?? "overview";
    const labels:Record<string,string> = {overview:"Overview",work:"Work",people:"People",files:"Files",approvals:"Approvals",conversations:"Conversations",activity:"Activity","ai workforce":"AI workforce"};
    return {
      section: record?.title ?? (project ? "Project workspace" : "Department workspace"),
      title: labels[section] ?? "Overview",
      parent: {title:parent,to:`/o/${slug}/workspace/${project ? "work" : "spaces"}`},
      action: section === "files" ? {title:"Open Docs",to:appEntry("DOCS",slug)}
        : section === "people" ? {title:"People",to:`/o/${slug}/workspace/people`}
        : section === "work" ? {title:"Projects",to:appEntry("PROJECT",slug)} : undefined,
    };
  }
  if (workspace) return null; // The top-level page already has its own heading and actions.
  const screen = findScreen(path)?.screen;
  if (!screen) return null;
  // Native editors own their command bars. Do not add a second competing toolbar.
  return null;
}
/** Only nested spaces receive an additional context row; the universal header
 * stays exactly one row for Home, Company, Spaces, Work and native editors. */
export function HeaderContextBar() {
  const {org} = useWorkspace();
  const location = useLocation();
  const { projects = [], departments = [] } = useCollections(["projects","departments"]);
  const context = useMemo(() => resolveHeaderContext(
    location.pathname,org.slug,location.search,projects,departments,
  ),[location.pathname,location.search,org.slug,projects,departments]);
  if (!context) return null;
  return <nav className="hq-context-bar" aria-label="Current workspace context">
    <Link className="hq-context-parent" to={context.parent?.to ?? `/o/${org.slug}/workspace/home`}>
      {context.parent?.title ?? "Workspace"}
    </Link>
    <ChevronRight size={14} aria-hidden="true"/>
    <span className="hq-context-workspace"><FolderKanban size={15} aria-hidden="true"/>{context.section}</span>
    <ChevronRight size={14} aria-hidden="true"/>
    <strong className="hq-context-title">{context.title}</strong>
    <span className="ds-grow"/>
    {context.action && <Link className="hq-context-action" to={context.action.to}>
      {context.title === "Files" ? <FileText size={15}/> : context.title === "People" ? <Users size={15}/> : <BriefcaseBusiness size={15}/>}
      {context.action.title}
    </Link>}
  </nav>;
}
