import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Menu as MenuIcon, Moon, Sparkles, Sun, Search, Bell, X } from "lucide-react";
import { Button, Pill, Row } from "@/design-system";
import { Menu } from "@/design-system/overlays";
import { ArloviMark, brand, palettes } from "@/app/brand";
import { NAV_GROUPS, APP_ENTRIES } from "@/app/nav";
import { appEntry, findScreen, screens } from "@/app/catalog";
import { destinationForOrganization } from "@/app/organizationNavigation";
import { ScreenHost } from "@/app/ScreenHost";
import { FirstRunGuide } from "@/app/FirstRunGuide";
import { GuidedTour } from "@/app/GuidedTour";
import { WORK_AREAS, WorkspaceNavigation, WorkspaceSideNav, currentWorkArea, isWorkAreaPath, workAreaPath } from "@/app/WorkspaceNavigation";
import { ScreenErrorBoundary } from "@/app/ErrorBoundary";
import { applicationLoadFailures, loadNativeApplication, prefetchNativeApplication } from "@/applications";
const CommandPalette = lazy(() => import("@/app/CommandPalette").then(module => ({ default: module.CommandPalette })));
import { recordNavigation, readNavigation } from "@/platform/navigationContinuity";
import { IntentPrefetchController } from "@/app/nativePrefetch";
const AttentionCentre = lazy(() => import("@/app/AttentionCentre").then(module => ({ default: module.AttentionCentre })));
const AskPanel = lazy(() => import("@/app/AskPanel").then(module => ({ default: module.AskPanel })));
import { ExecutionTray } from "@/app/ExecutionTray";
import { getApp, useApplicationRegistryRevision } from "@/platform/registry";
import { canOpen, ROLE_LABELS } from "@/platform/policy";
import { ORGS } from "@/platform/org";
import { useCollections, useWorkspace, useMutations } from "@/platform/workspace";
import { buildAttention, filterForRole, attentionCounts } from "@/platform/attention";
import { applyAttentionReceipts } from "@/platform/attentionReceipts";
import { useUi } from "@/runtime/ui";
import type { Role } from "@/domain/types";
import "@/app/shell.css";

export function AppShell() {
  useApplicationRegistryRevision();
  const ui = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const { org, role, now } = useWorkspace();
  const mutate = useMutations();
  const [navOpen, setNavOpen] = useState(false);
  const keyboardHint = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";

  const isWorkspaceArea = isWorkAreaPath(location.pathname, org.slug);
  const activeArea = currentWorkArea(location.pathname);
  const activeScreen = useMemo(() => findScreen(location.pathname)?.screen, [location.pathname]);
  const activeCode = activeScreen?.applicationCode ?? "HQ";
  const appModule = getApp(activeCode);

  // Load the actual destination before any unrelated native application.
  useEffect(() => {
    if(!activeScreen) return;
    void loadNativeApplication(activeScreen.applicationCode).catch(() => undefined);
  }, [activeScreen?.applicationCode]);

  // Demand-loading the active route above always takes priority. Speculative
  // navigation hints are deliberately delayed, cancellable and connection-aware.
  const prefetchController = useMemo(
    () => new IntentPrefetchController(prefetchNativeApplication), [org.id],
  );
  useEffect(() => () => prefetchController.dispose(), [prefetchController]);
  useEffect(() => {
    prefetchController.cancel();
    // One actual recently visited native app is a useful low-priority prediction
    // from Home. No broad directory scans, no automatic background fan-out.
    if (location.pathname !== workAreaPath(org.slug, "home")) return;
    const recent = readNavigation(org.id, org.slug).recent;
    const candidate = recent
      .map(item => findScreen(item.path)?.screen)
      .find(screen => screen && screen.applicationCode !== "HQ" && canOpen(role, screen.applicationCode));
    if (candidate) prefetchController.schedule(candidate.applicationCode, 5000);
    return () => prefetchController.cancel();
  }, [location.pathname, org.id, org.slug, role, prefetchController]);

  function linkedApplicationCode(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || !link.pathname.startsWith(`/o/${org.slug}/`)) return null;
    const screen = findScreen(link.pathname)?.screen;
    if (!screen || screen.applicationCode === activeScreen?.applicationCode || !canOpen(role, screen.applicationCode)) return null;
    return screen.applicationCode;
  }
  function prefetchLinkedApplication(target: EventTarget | null, delay = 180) {
    const code = linkedApplicationCode(target);
    if (code) prefetchController.schedule(code, delay);
  }
  function cancelPrefetchOnExit(target: EventTarget | null, next: EventTarget | null) {
    if (!(target instanceof Element)) return;
    const link = target.closest("a[href]");
    if (link && next instanceof Node && link.contains(next)) return;
    prefetchController.cancel();
  }

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

  useEffect(() => {
    setNavOpen(false);
    const container = document.querySelector<HTMLElement>(".hq-scroll");
    if (container) container.scrollTop = 0;
    // A keyboard/screen-reader user needs a reliable focus destination after
    // client-side routing. Skip the focus move for the first shell mount.
    const heading = container?.querySelector<HTMLElement>("h1");
    if (heading) {
      heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      setNavOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [navOpen]);

  useEffect(() => {
    recordNavigation(org.id, org.slug, location.pathname);
  }, [org.id, org.slug, location.pathname]);

  useEffect(() => {
    try { localStorage.setItem("arlovi-last-workspace", org.slug); } catch { /* optional local preference */ }
  }, [org.slug]);

  return (
    <div className="hq" data-nav-open={navOpen ? "true" : "false"}
      onPointerOver={event => { if (event.pointerType !== "touch") prefetchLinkedApplication(event.target); }}
      onPointerOut={event => cancelPrefetchOnExit(event.target, event.relatedTarget)}
      onFocusCapture={event => prefetchLinkedApplication(event.target, 100)}
      onBlurCapture={event => cancelPrefetchOnExit(event.target, event.relatedTarget)}>
      <a className="ds-skip" href="#main">Skip to content</a>
      <GuidedTour />

      <header className="hq-header">
        <Button variant="ghost" size="sm" iconOnly aria-label={navOpen ? "Close navigation" : "Open navigation"} className="hq-only-mobile" onClick={() => setNavOpen(!navOpen)}>
          {navOpen ? <X size={18} /> : <MenuIcon size={18} />}
        </Button>
        <Link to={workAreaPath(org.slug,"home")} className="hq-brand" aria-label={`${brand.name} home`}>
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
            { label: "Take a guided tour", group: "Help", separatorBefore: true, onSelect: () => window.dispatchEvent(new Event("arlovi:start-tour")) },
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

      <div className="hq-frame" data-appnav={isWorkspaceArea || appModule ? "true" : "false"}>
        <button type="button" className="hq-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />

        <nav className="hq-rail" aria-label="Primary navigation">
          <div className="hq-rail-group ws-primary-group">
            {WORK_AREAS.map((area) => {
              const Icon = area.icon;
              return <Link key={area.id} to={workAreaPath(org.slug,area.id)}
                className="hq-rail-btn" data-active={isWorkspaceArea && activeArea === area.id ? "true" : undefined}
                aria-current={isWorkspaceArea && activeArea === area.id ? "page" : undefined}
                title={area.label} aria-label={area.label}><Icon size={19} strokeWidth={1.8}/></Link>;
            })}
          </div>
          <span className="hq-rail-rule" aria-hidden="true"/>
          <div className="hq-rail-group">
            {favourites.slice(0,8).map(app => {
              const Icon = app.icon;
              return <Link key={app.code} to={appEntry(app.code,org.slug)}
                className="hq-rail-btn" data-active={!isWorkspaceArea && activeCode === app.code ? "true" : undefined}
                aria-current={!isWorkspaceArea && activeCode === app.code ? "page" : undefined}
                title={app.short} aria-label={app.short}><Icon size={19} strokeWidth={1.8}/></Link>;
            })}
          </div>
        </nav>

        {isWorkspaceArea && <WorkspaceSideNav />}
        {!isWorkspaceArea && appModule && (
          <nav className="hq-appnav" aria-label={`${appModule.short} navigation`}>
            <div className="hq-appnav-head">
              <Row gap={2}>
                <appModule.icon size={18} strokeWidth={1.9} />
                <h2 className="ds-grow ds-truncate">{appModule.short}</h2>
              </Row>
              <p>{appModule.purpose}</p>
            </div>
            <div className="hq-appnav-body">
              {appModule.nav.map((section) => (
                <div key={section.label ?? "root"}>
                  {section.label && <div className="hq-navsection">{section.label}</div>}
                  {section.items.map((item) => {
                    const target = screens.find((screen) => screen.id === item.screenId);
                    if (!target) return null;
                    const to = target.route
                      .replace(":org", org.slug)
                      .replace(":id", target.sampleId)
                      .replace(":slug", "showroom-consult");
                    const ItemIcon = item.icon;
                    return (
                      <NavLink key={item.screenId} to={to} end className="hq-navlink">
                        {ItemIcon && <ItemIcon size={15} />}
                        <span className="ds-truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              ))}
            </div>
          </nav>
        )}

        <main className="hq-main" id="main">
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
          {org.ownerName && (location.pathname === `/o/${org.slug}/hq/home` || location.pathname === workAreaPath(org.slug,"home")) && <FirstRunGuide />}
          <ScreenErrorBoundary resetKey={location.pathname} label={isWorkspaceArea ? "Workspace" : activeScreen?.title ?? "This screen"}>
            {isWorkspaceArea ? <WorkspaceNavigation /> : <ScreenHost />}
          </ScreenErrorBoundary>
          </div>
          <ExecutionTray missions={data.missions} />
        </main>
      </div>

      <nav className="hq-bottom" aria-label="Primary">
        {WORK_AREAS.slice(0,4).map(area => {
          const Icon = area.icon;
          return <NavLink key={area.id} to={workAreaPath(org.slug,area.id)} aria-label={area.label}>
            <Icon size={19} strokeWidth={1.8}/><span>{area.label}</span>
          </NavLink>;
        })}
        <NavLink to={workAreaPath(org.slug,"apps")} aria-label="Apps">
          <MenuIcon size={19}/><span>Apps</span>
        </NavLink>
      </nav>

      {ui.command && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening search…</div>}><CommandPalette onClose={() => ui.setCommand(false)} /></Suspense>}
      {ui.notes && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening attention centre…</div>}><AttentionCentre items={attention} onClose={() => ui.setNotes(false)} /></Suspense>}
      {ui.ask && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening assistant…</div>}><AskPanel onClose={() => ui.setAsk(false)} seed={ui.askSeed} /></Suspense>}

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
