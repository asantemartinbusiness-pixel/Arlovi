/** Canonical contextual workspace navigation. The five primary rail areas are
 * destinations, not a menu to repeat again in every secondary sidebar. */
export type WorkspaceArea = "home" | "company" | "spaces" | "work" | "apps";
export type WorkspaceSection = WorkspaceArea | "recent" | "resources" | "people" | "account" | "health";
export interface WorkspaceDestination {
  title: string;
  description: string;
  area: WorkspaceArea;
  section: WorkspaceSection;
}
const sections: Record<WorkspaceSection, WorkspaceDestination> = {
  home: { title: "My Workspace", description: "Your work and decisions", area: "home", section: "home" },
  company: { title: "Company Headquarters", description: "Your organisation and its people", area: "company", section: "company" },
  spaces: { title: "Spaces", description: "Departments and shared environments", area: "spaces", section: "spaces" },
  work: { title: "Work", description: "Projects, missions and tasks", area: "work", section: "work" },
  apps: { title: "Applications", description: "Native tools for every department", area: "apps", section: "apps" },
  recent: { title: "Recent & saved", description: "Return to your work", area: "home", section: "recent" },
  resources: { title: "Files & resources", description: "Documents and shared resources", area: "spaces", section: "resources" },
  people: { title: "People & collaboration", description: "Company directory and team spaces", area: "company", section: "people" },
  account: { title: "Account & data", description: "Identity and data readiness", area: "company", section: "account" },
  health: { title: "Workspace health", description: "Diagnostics and recovery", area: "company", section: "health" },
};
export function workspaceDestination(pathname: string): WorkspaceDestination | null {
  const match = /^\/o\/[^/]+\/workspace\/([^/?#]+)/.exec(pathname);
  return match ? sections[match[1] as WorkspaceSection] ?? null : null;
}
export function workspacePrimaryArea(pathname: string): WorkspaceArea | null {
  return workspaceDestination(pathname)?.area ?? null;
}
export function workspaceSectionPath(slug: string, section: WorkspaceSection): string {
  return `/o/${slug}/workspace/${section}`;
}
export function workspaceDetailPath(slug: string, kind: "project" | "department", id: string): string {
  return `${workspaceSectionPath(slug,kind==="project"?"work":"spaces")}/${kind}/${id}`;
}
