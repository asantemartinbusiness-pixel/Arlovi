import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Menu as MenuIcon, Moon, Sparkles, Sun, Search, Bell, X, Home, BriefcaseBusiness, Inbox, WandSparkles, LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button, Pill } from "@/design-system";
import { Menu } from "@/design-system/overlays";
import { ArloviMark, brand, palettes } from "@/app/brand";
import { NAV_GROUPS, APP_ENTRIES } from "@/app/nav";
import { appEntry, findScreen, screens } from "@/app/catalog";
import { HeadquartersNavigation } from "@/app/HeadquartersNavigation";
import { AppLauncher } from "@/app/AppLauncher";
import { areaForApplication, contextualScreenPath } from "@/app/navigationModel";
import { destinationForOrganization } from "@/app/organizationNavigation";
import { ScreenHost } from "@/app/ScreenHost";
import { FirstRunGuide } from "@/app/FirstRunGuide";
import { ScreenErrorBoundary } from "@/app/ErrorBoundary";
import { applicationLoadFailures } from "@/applications";
import { CommandPalette } from "@/app/CommandPalette";
import { AttentionCentre } from "@/app/AttentionCentre";
import { AskPanel } from "@/app/AskPanel";
import { ExecutionTray } from "@/app/ExecutionTray";
import { getApp } from "@/platform/registry";
import { canOpen, ROLE_LABELS } from "@/platform/policy";
import { ORGS } from "@/platform/org";
import { useCollections, useWorkspace, useMutations } from "@/platform/workspace";
import { buildAttention, filterForRole, attentionCounts } from "@/platform/attention";
import { applyAttentionReceipts } from "@/platform/attentionReceipts";
import { useUi } from "@/runtime/ui";
import type { Role } from "@/domain/types";
import "@/app/shell.css";
import "@/app/navigation.css";

export function AppShell() {
  const ui = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const { org, role, now } = useWorkspace();
  const mutate = useMutations();
  const [navOpen, setNavOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"global" | "app">("global");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [launcherGroup, setLauncherGroup] = useState<string | undefined>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("arlovi-headquarters-sidebar-collapsed") === "true"; } catch { return false; }
  });
  const [contextCollapsed, setContextCollapsed] = useState(() => {
    try { return localStorage.getItem("arlovi-app-pages-collapsed") === "true"; } catch { return false; }
  });
  const closeLauncher = useCallback(() => setLauncherOpen(false), []);
  const openLauncher = useCallback((group?: string) => {
    setLauncherGroup(group);
    setLauncherOpen(true);
    setNavOpen(false);
  }, []);
  const keyboardHint = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";

  const activeMatch = useMemo(() => findScreen(location.pathname), [location.pathname]);
  const activeScreen = activeMatch?.screen;
  const activeCode = activeScreen?.applicationCode ?? "HQ";
  const appModule = getApp(activeCode);
  // Headquarters is the parent workspace: its navigation already lives in
  // the primary sidebar. Only native specialist applications get a second pane.
  const showAppNav = Boolean(appModule && activeCode !== "HQ");
  const contextSections = appModule?.nav.map((section) => ({
    ...section,
    items: section.items.map((item) => {
      const screen = screens.find((candidate) => candidate.id === item.screenId);
      const href = screen ? contextualScreenPath(screen, org.slug, activeMatch?.params.id, activeMatch?.params.slug) : null;
      return href ? { ...item, href } : null;
    }).filter((item): item is NonNullable<typeof item> => item !== null),
  })).filter((section) => section.items.length > 0) ?? [];

  const data = useCollections(["notifications", "invoices", "bills", "tasks", "missions", "deals", "leaveRequests", "expenses", "organizations", "preferences"]);
  const attention = useMemo(() => applyAttentionReceipts(filterForRole(buildAttention({
    notifications: data.notifications,
    invoices: data.invoices,
    bills: data.bills,
    tasks: data.tasks,
    missions: data.missions,
    approvals: [...data.invoices, ...data.bills, ...data.expenses, ...data.deals, ...data.leaveRequests, ...data.missions],
    orgSlug: org.slug,
    now,
  }), role), ui.attentionReceipts, org.id, role), [data, org.slug, org.id, now, role, ui.attentionReceipts]);
  const counts = attentionCounts(attention);
  const favourites = useMemo(() => {
    const pinned = new Set(data.preferences.filter((pref) => pref.fields.pinned === true).map((pref) => String(pref.fields.app)));
    return NAV_GROUPS.flatMap((group) => group.apps).filter((app) => pinned.has(app.short) && canOpen(role, app.code));
  }, [data.preferences, role]);
  const activePreference = data.preferences.find((item) => item.fields.app === APP_ENTRIES[activeCode]?.short);
  const activePinned = activePreference?.fields.pinned === true;

  async function toggleFavourite() {
    const app = APP_ENTRIES[activeCode];
    if (!app) return;
    if (activePreference) {
      await mutate.patch(activePreference.id, { fields: { pinned: !activePinned } }, { event: `${app.short} ${activePinned ? "removed from" : "added to"} favourites` });
    } else {
      await mutate.create({ collection: "preferences", title: `App preference: ${app.short}`, status: "active",
        fields: { app: app.short, pinned: true, mode: "native_local" },
        summary: "Application is pinned in the local navigation." }, `${app.short} added to favourites`);
    }
  }

  const paused = data.organizations.find((record) => record.id === org.id)?.fields.executionPaused === true;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        ui.setCommand(true);
        return;
      }
      if (!typing && event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        ui.setCommand(true);
      }
    }
    const online = () => ui.setOffline(false);
    const offline = () => ui.setOffline(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [ui]);

  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem("arlovi-headquarters-sidebar-collapsed", String(sidebarCollapsed)); } catch { /* preference is optional */ }
  }, [sidebarCollapsed]);
  useEffect(() => {
    try { localStorage.setItem("arlovi-app-pages-collapsed", String(contextCollapsed)); } catch { /* preference is optional */ }
  }, [contextCollapsed]);

  useEffect(() => {
    try { localStorage.setItem("arlovi-last-workspace", org.slug); } catch { /* optional local preference */ }
  }, [org.slug]);

  return (
    <div className="hq" data-nav-open={navOpen ? "true" : "false"} data-mobile-panel={mobilePanel} data-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}>
      <a className="ds-skip" href="#main">Skip to content</a>

      <header className="hq-header">
        <Button variant="ghost" size="sm" iconOnly aria-label={navOpen && mobilePanel === "global" ? "Close navigation" : "Open navigation"} className="hq-only-mobile" onClick={() => { setMobilePanel("global"); setNavOpen(navOpen && mobilePanel === "global" ? false : true); }}>
          {navOpen && mobilePanel === "global" ? <X size={18} /> : <MenuIcon size={18} />}
        </Button>
        {showAppNav && appModule && (
          <Button variant="ghost" size="sm" iconOnly aria-label={`Open ${appModule.short} pages`} className="hq-header-context-toggle hq-only-mobile" onClick={() => { setMobilePanel("app"); setNavOpen(true); }}>
            <PanelLeftOpen size={18} />
          </Button>
        )}
        <Link to={`/o/${org.slug}/hq/home`} className="hq-brand" aria-label={`${brand.name} home`}>
          <ArloviMark size={26} />
          <strong className="hq-hide-sm" style={{ fontSize: "var(--text-md)", letterSpacing: "-0.03em" }}>{brand.name}</strong>
        </Link>

        <Menu
          label="Switch organisation"
          align="start"
          trigger={
            <button type="button" className="hq-orgswitch">
              <span className="hq-orgdot" style={{ background: org.accent }}>{org.shortName.slice(0, 1)}</span>
              <span className="name ds-truncate">{org.name}</span>
              <ChevronDown size={14} />
            </button>
          }
          items={[
            ...ORGS.map((item) => ({
              label: item.id === org.id ? `${item.name} · current` : item.name,
              group: "Organisations",
              onSelect: () => navigate(destinationForOrganization(location.pathname, location.search, item.slug)),
            })),
            { label: "Create another company", group: "Company", separatorBefore: true, onSelect: () => navigate("/setup") },
          ]}
        />

        <div className="hq-header-path" aria-label="Current workspace">
          <span>{activeCode === "HQ" ? "Company" : areaForApplication(activeCode)}</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong className="ds-truncate">{activeCode === "HQ" ? activeScreen?.title ?? "Headquarters" : appModule?.short ?? "Headquarters"}</strong>
        </div>
        <span className="ds-grow" />

        <button type="button" className="hq-search" onClick={() => ui.setCommand(true)} aria-label={`Search ${org.shortName}`} aria-keyshortcuts="Control+K Meta+K">
          <Search size={15} />
          <span className="ds-grow" style={{ textAlign: "start" }}>Search {org.shortName}</span>
          <kbd className="ds-kbd">{keyboardHint}</kbd>
        </button>

        <Button variant="primary" size="sm" icon={<Sparkles size={15} />} aria-label={brand.ask} onClick={() => ui.setAsk(true)}>
          <span className="hq-hide-sm">{brand.ask}</span>
        </Button>

        <div className="hq-bell">
          <Button variant="ghost" size="sm" iconOnly aria-label={`Attention centre, ${counts.unread} unread`} onClick={() => ui.setNotes(!ui.notes)}>
            <Bell size={17} />
          </Button>
          {counts.unread > 0 && <span className="hq-bell-count" aria-hidden="true">{counts.unread > 99 ? "99+" : counts.unread}</span>}
        </div>

        <Menu
          label="Workspace settings"
          trigger={<Button variant="ghost" size="sm" iconOnly aria-label={`Account and view settings. Role ${ROLE_LABELS[role]}`}>
            <span className="hq-orgdot" style={{ background: "var(--accent)", width: 24, height: 24 }}>{ROLE_LABELS[role].slice(0, 1)}</span>
          </Button>}
          items={[
            ...(["owner", "finance", "sales", "people", "member", "client"] as Role[]).map((item) => ({
              label: item === role ? `${ROLE_LABELS[item]} · current view` : ROLE_LABELS[item],
              group: "Role view (not a security boundary)",
              onSelect: () => ui.setRole(item),
            })),
            { label: `${activePinned ? "Remove" : "Pin"} ${APP_ENTRIES[activeCode]?.short ?? "this app"} ${activePinned ? "from" : "to"} favourites`, group: "Navigation", separatorBefore: true, onSelect: () => { void toggleFavourite(); } },
            ...(org.ownerName ? [{ label: "Review company setup", group: "Navigation", onSelect: () => navigate(`/o/${org.slug}/hq/home?gettingStarted=1`) }] : []),
            { label: ui.theme === "light" ? "Dark appearance" : "Light appearance", group: "Appearance", separatorBefore: true, onSelect: () => ui.setTheme(ui.theme === "light" ? "dark" : "light") },
            ...(["comfortable", "balanced", "compact"] as const).map((item) => ({
              label: item === ui.density ? `Density: ${item} · current` : `Density: ${item}`,
              group: "Appearance",
              onSelect: () => ui.setDensity(item),
            })),
            ...palettes.map((item) => ({
              label: item.id === ui.palette ? `${item.label} · current` : item.label,
              group: "Brand direction",
              onSelect: () => ui.setPalette(item.id),
            })),
          ]}
        />

        <Button variant="ghost" size="sm" iconOnly className="hq-hide-xs" aria-label={ui.theme === "light" ? "Use dark appearance" : "Use light appearance"} onClick={() => ui.setTheme(ui.theme === "light" ? "dark" : "light")}>
          {ui.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </Button>
      </header>

      <div className="hq-frame" data-appnav={showAppNav ? "true" : "false"} data-context-collapsed={contextCollapsed ? "true" : "false"}>
        <button type="button" className="hq-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />

        <HeadquartersNavigation
          orgSlug={org.slug}
          orgName={org.name}
          role={role}
          activeCode={activeCode}
          pathname={location.pathname}
          favourites={favourites}
          collapsed={sidebarCollapsed}
          onCollapse={() => setSidebarCollapsed((value) => !value)}
          onBrowse={openLauncher}
        />

        {showAppNav && appModule && (
          <nav className="hq-appnav" aria-label={`${appModule.short} pages`}>
            <div className="hq-appnav-head">
              <div className="hq-appnav-heading">
                <button
                  type="button"
                  className="hq-appnav-ctrl hq-appnav-back"
                  aria-label="Back to headquarters navigation"
                  title="Back to headquarters navigation"
                  onClick={() => { setMobilePanel("global"); setNavOpen(true); }}
                ><ChevronLeft size={17} /></button>
                <appModule.icon size={19} strokeWidth={1.75} aria-hidden="true" />
                <div className="hq-appnav-identity">
                  <strong>{appModule.short}</strong>
                  <small>In this workspace</small>
                </div>
                <button
                  type="button"
                  className="hq-appnav-ctrl hq-appnav-collapse"
                  title="Hide this application's pages"
                  aria-label={`Collapse ${appModule.short} pages`}
                  onClick={() => { setContextCollapsed(true); setNavOpen(false); }}
                ><PanelLeftClose size={17} /></button>
              </div>
              <p>{appModule.purpose}</p>
            </div>
            <div className="hq-appnav-body">
              <NavLink className="hq-appnav-home" to={appEntry(activeCode, org.slug)} end>
                <Home size={15} aria-hidden="true" />
                <span>Workspace home</span>
              </NavLink>
              {contextSections.map((section) => (
                <div key={section.label ?? "root"} className="hq-appnav-rest">
                  {section.label && <div className="hq-navsection">{section.label}</div>}
                  {section.items.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <NavLink key={item.screenId} to={item.href} end className="hq-navlink">
                        {ItemIcon && <ItemIcon size={15} aria-hidden="true" />}
                        <span className="ds-truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ))}
              {contextSections.length === 0 && <p className="hq-sidebar-empty">Open a file or record to see its editing tools and related pages.</p>}
            </div>
          </nav>
        )}

        <main className="hq-main" id="main">
          {showAppNav && appModule && contextCollapsed && (
            <div className="hq-context-restore">
              <button type="button" onClick={() => setContextCollapsed(false)} aria-label={`Show ${appModule.short} pages`}>
                <PanelLeftOpen size={16} /> Show {appModule.short} pages
              </button>
              <span className="ds-subtle">Workspace navigation is collapsed to give your work more room.</span>
            </div>
          )}
          {/* The page scrolls here, above the tray, so the tray never covers content. */}
          <div className="hq-scroll">
          {applicationLoadFailures().length > 0 && (
            <div className="hq-banners">
              <div className="ds-notice" data-tone="danger" role="alert">
                <div>
                  <strong className="ds-notice-title">Some applications could not be loaded</strong>
                  {applicationLoadFailures().map((failure) => `${failure.group}: ${failure.message}`).join(" · ")}
                  {" "}Every other application is working normally.
                </div>
              </div>
            </div>
          )}
          {(ui.offline || paused) && (
            <div className="hq-banners">
              {ui.offline && (
                <div className="ds-notice" data-tone="info" role="status">
                  <div><strong className="ds-notice-title">Offline</strong>This workspace is in your browser, so it keeps working. Nothing is sent anywhere.</div>
                </div>
              )}
              {paused && (
                <div className="ds-notice" data-tone="warning" role="status">
                  <div className="ds-grow">
                    <strong className="ds-notice-title">Mission dispatch is paused</strong>
                    New autonomous steps will not start. Actions already accepted elsewhere cannot be confirmed from here.
                  </div>
                  {role === "owner" && (
                    <Button size="sm" onClick={() => mutate.patch(org.id, { fields: { ...data.organizations.find((item) => item.id === org.id)?.fields, executionPaused: false } }, { event: "Mission dispatch resumed" })}>
                      Resume dispatch
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
          {org.ownerName && location.pathname === `/o/${org.slug}/hq/home` && <FirstRunGuide />}
          <ScreenErrorBoundary resetKey={location.pathname} label={activeScreen?.title ?? "This screen"}>
            <ScreenHost />
          </ScreenErrorBoundary>
          </div>
          <ExecutionTray missions={data.missions} />
        </main>
      </div>

      <nav className="hq-bottom" aria-label="Primary">
        {([
          { label: "Home", to: `/o/${org.slug}/hq/home`, code: "HQ", icon: Home },
          { label: "My work", to: `/o/${org.slug}/hq/my-work`, code: "HQ", icon: BriefcaseBusiness },
          { label: "Inbox", to: appEntry("INBOX", org.slug), code: "INBOX", icon: Inbox },
          { label: "Studio", to: appEntry("DESIGN", org.slug), code: "DESIGN", icon: WandSparkles },
        ] as const).filter((item) => canOpen(role, item.code)).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.label} to={item.to} end>
              <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" aria-label="Browse all applications" onClick={() => openLauncher()}>
          <LayoutGrid size={19} strokeWidth={1.8} aria-hidden="true" />
          <span>Apps</span>
        </button>
      </nav>
      {launcherOpen && (
        <AppLauncher
          orgSlug={org.slug}
          orgName={org.name}
          role={role}
          initialGroup={launcherGroup}
          favourites={favourites}
          onClose={closeLauncher}
        />
      )}

      {ui.command && <CommandPalette onClose={() => ui.setCommand(false)} />}
      {ui.notes && <AttentionCentre items={attention} onClose={() => ui.setNotes(false)} />}
      {ui.ask && <AskPanel onClose={() => ui.setAsk(false)} seed={ui.askSeed} />}

      <div className="ds-toasts" aria-live="polite" aria-atomic="false">
        {ui.toasts.map((toast) => (
          <div key={toast.id} className="ds-toast" data-tone={toast.tone}>
            <div className="ds-grow">
              <strong>{toast.title}</strong>
              <p>{toast.body}</p>
            </div>
            <Button variant="ghost" size="sm" iconOnly aria-label="Dismiss" onClick={() => ui.dismissToast(toast.id)}><X size={14} /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ShellStatusPill({ tone, children }: { tone: "success" | "warning" | "danger" | "info"; children: string }) {
  return <Pill tone={tone} dot>{children}</Pill>;
}

export { ArloviMark };
export const SHELL_REF = { current: null as HTMLDivElement | null };
void useRef;
