import { Link, NavLink } from "react-router-dom";
import {
  ArrowUpRight, Boxes, BriefcaseBusiness, Building2, ChevronLeft,
  ChevronRight, Command, Home, Inbox, LayoutGrid, Rocket, Settings2, Sparkles,
  UsersRound, WandSparkles,
} from "lucide-react";
import { appEntry } from "@/app/catalog";
import { NAV_GROUPS, type AppNavEntry } from "@/app/nav";
import { canOpen } from "@/platform/policy";
import type { Role } from "@/domain/types";
import "./navigation.css";

interface LinkDef {
  id: string;
  label: string;
  icon: typeof Home;
  path?: string;
  app?: string;
  area?: string;
}

const PRIMARY: { label: string; links: LinkDef[] }[] = [
  { label: "MY OFFICE", links: [
    { id: "home", label: "Home", icon: Home, path: "hq/home" },
    { id: "my-work", label: "My Workspace", icon: BriefcaseBusiness, path: "hq/my-work" },
    { id: "inbox", label: "Inbox", icon: Inbox, app: "INBOX" },
  ] },
  { label: "COMPANY", links: [
    { id: "company", label: "Company Overview", icon: Building2, path: "hq/company" },
    { id: "departments", label: "Departments", icon: UsersRound, path: "hq/departments" },
    { id: "missions", label: "Mission Control", icon: Rocket, app: "MISSION" },
  ] },
  { label: "WORKSPACES", links: [
    { id: "intelligence", label: "Intelligence", icon: Sparkles, app: "AI", area: "Intelligence" },
    { id: "studio", label: "Studio", icon: WandSparkles, app: "DESIGN", area: "Studio" },
    { id: "projects", label: "Projects", icon: Boxes, app: "PROJECT" },
  ] },
];

export const PRIMARY_NAV_SECTIONS = PRIMARY;

/** The native suite has a complete catalogue; the sidebar deliberately does not show all 35 apps. */
export function workspaceArea(code: string): string {
  return NAV_GROUPS.find((group) => group.apps.some((app) => app.code === code))?.label ?? "Headquarters";
}

function linkTo(item: LinkDef, orgSlug: string): string {
  return item.path ? `/o/${orgSlug}/${item.path}` : appEntry(item.app ?? "HQ", orgSlug);
}

export function primaryDestinations(slug: string): { label: string; href: string }[] {
  return PRIMARY.flatMap((section) => section.links.map((entry) => ({
    label: entry.label,
    href: linkTo(entry, slug),
  })));
}

interface Props {
  orgSlug: string;
  orgName: string;
  role: Role;
  activeCode: string;
  pathname: string;
  favourites: AppNavEntry[];
  collapsed: boolean;
  onCollapse: () => void;
  onBrowse: (group?: string) => void;
}

export function HeadquartersNavigation({
  orgSlug, orgName, role, activeCode, pathname, favourites, collapsed, onCollapse, onBrowse,
}: Props) {
  const visibleGroups = PRIMARY.map((section) => ({
    ...section,
    links: section.links.filter((entry) => !entry.app || canOpen(role, entry.app)),
  })).filter((section) => section.links.length > 0);
  const allowedFavs = favourites.filter((item) => canOpen(role, item.code)).slice(0, 5);

  return (
    <nav className="hq-sidebar" aria-label="Headquarters navigation">
      <div className="hq-sidebar-top">
        <div className="hq-sidebar-identity">
          <span className="hq-sidebar-monogram" aria-hidden="true">{orgName.slice(0, 1)}</span>
          <span className="hq-sidebar-identity-copy">
            <strong className="ds-truncate">{orgName}</strong>
            <small>Company headquarters</small>
          </span>
        </div>
        <span className="hq-sidebar-kicker">WORKSPACE NAVIGATION</span>
      </div>

      <div className="hq-sidebar-scroll">
        {visibleGroups.map((section) => (
          <section key={section.label} className="hq-sidebar-section" aria-label={section.label}>
            <h2 className="hq-sidebar-group-label">{section.label}</h2>
            {section.links.map((item) => {
              const Icon = item.icon;
              const destination = linkTo(item, orgSlug);
              const exact = pathname === destination;
              const isArea = Boolean(item.area && workspaceArea(activeCode) === item.area);
              const inDepartment = item.id === "departments" && pathname.startsWith(`/o/${orgSlug}/hq/departments/`);
              const inCompany = item.id === "company" && ["organization", "goals", "locations", "timeline", "directory"].some((section) => pathname.startsWith(`/o/${orgSlug}/hq/${section}`));
              const active = exact || inDepartment || inCompany || (item.app && !item.area && activeCode === item.app && !pathname.startsWith(`/o/${orgSlug}/hq/`)) || isArea;
              return (
                <NavLink
                  key={item.id}
                  to={destination}
                  end={!item.app}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                  className="hq-sidebar-link"
                  data-active={active ? "true" : undefined}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  <span className="hq-sidebar-link-label">{item.label}</span>
                  {active && <span className="hq-sidebar-active-dot" aria-hidden="true" />}
                </NavLink>
              );
            })}
          </section>
        ))}

        <section className="hq-sidebar-section hq-sidebar-favourites" aria-label="Favourite applications">
          <div className="hq-sidebar-section-head">
            <h2 className="hq-sidebar-group-label">PINNED APPLICATIONS</h2>
            {allowedFavs.length > 0 && <span className="hq-sidebar-count">{allowedFavs.length}</span>}
          </div>
          {allowedFavs.length ? allowedFavs.map((app) => {
            const Icon = app.icon;
            return (
              <Link
                key={app.code}
                to={appEntry(app.code, orgSlug)}
                className="hq-sidebar-link hq-sidebar-fav"
                title={app.short}
                aria-label={app.short}
                data-active={activeCode === app.code ? "true" : undefined}
              >
                <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                <span className="hq-sidebar-link-label">{app.short}</span>
                <ArrowUpRight className="hq-sidebar-fav-arrow" size={14} aria-hidden="true" />
              </Link>
            );
          }) : (
            <p className="hq-sidebar-empty">Pin the applications you use most often. Everything else stays in Apps.</p>
          )}
        </section>
      </div>

      <div className="hq-sidebar-bottom">
        <button type="button" className="hq-sidebar-launcher" onClick={() => onBrowse()} aria-label="Browse all applications">
          <LayoutGrid size={18} strokeWidth={1.75} />
          <span className="hq-sidebar-link-label">All applications</span>
          <span className="hq-sidebar-count hq-sidebar-app-count">35</span>
        </button>
        {canOpen(role, "ADMIN") && (
          <NavLink
            to={appEntry("ADMIN", orgSlug)}
            className="hq-sidebar-link"
            aria-label="Administration"
            title={collapsed ? "Administration" : undefined}
            data-active={activeCode === "ADMIN" ? "true" : undefined}
          >
            <Settings2 size={18} strokeWidth={1.75} aria-hidden="true" />
            <span className="hq-sidebar-link-label">Administration</span>
          </NavLink>
        )}
        <button type="button" className="hq-sidebar-collapse" onClick={onCollapse} aria-label={collapsed ? "Expand headquarters sidebar" : "Collapse headquarters sidebar"}>
          {collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
          <span className="hq-sidebar-link-label">{collapsed ? "Expand navigation" : "Collapse sidebar"}</span>
          <Command className="hq-sidebar-collapse-ornament" size={14} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
