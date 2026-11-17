import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Menu as MenuIcon, Sparkles, Search, Bell, Inbox, X, UserRound } from "lucide-react";
import { Button, Pill, Row } from "@/design-system";
import { Menu } from "@/design-system/overlays";
import { ArloviMark, brand, palettes } from "@/app/brand";
import { NAV_GROUPS, APP_ENTRIES } from "@/app/nav";
import { appEntry, findScreen, nativeNavPath, screens } from "@/app/catalog";
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
import { HeaderContextBar } from "@/app/HeaderContextBar";
import { getApp, useApplicationRegistryRevision } from "@/platform/registry";
import { canOpen, ROLE_LABELS } from "@/platform/policy";
import { ORGS } from "@/platform/org";
import { useCollections, useWorkspace, useMutations } from "@/platform/workspace";
import { buildAttention, filterForRole, headerAttentionCounts } from "@/platform/attention";
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
  const [attentionView, setAttentionView] = useState<"for-you" | "approvals" | "updates">("for-you");
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const keyboardHint = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";

  const isWorkspaceArea = isWorkAreaPath(location.pathname, org.slug);
  const activeArea = currentWorkArea(location.pathname);
  const activeMatch = useMemo(() => findScreen(location.pathname), [location.pathname]);
  const activeScreen = activeMatch?.screen;
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

  const data = useCollections(["notifications", "invoices", "bills", "tasks", "missions", "deals", "leaveRequests", "expenses", "workflowApprovals", "organizations", "preferences"]);
  const attention = useMemo(() => applyAttentionReceipts(filterForRole(buildAttention({
    notifications: data.notifications,
    invoices: data.invoices,
    bills: data.bills,
    tasks: data.tasks,
    missions: data.missions,
    approvals: [...data.invoices, ...data.bills, ...data.expenses, ...data.deals, ...data.leaveRequests, ...data.missions],
    workflowApprovals: data.workflowApprovals,
    orgSlug: org.slug,
    now,
  }), role), ui.attentionReceipts, org.id, role), [data, org.slug, org.id, now, role, ui.attentionReceipts]);
  const contextVisible = isWorkspaceArea && ["project","department"].includes(location.pathname.split("/")[5]);
  const {decisions, unreadUpdates: updates} = headerAttentionCounts(attention);
  function openCommand() { ui.setAsk(false); ui.setNotes(false); ui.setCommand(true); }
  function openAsk() { ui.setCommand(false); ui.setNotes(false); ui.setAsk(true); }
  function openAttention(view: "for-you" | "approvals" | "updates") {
    if (ui.notes && attentionView === view) {ui.setNotes(false);return;}
    setAttentionView(view);ui.setCommand(false);ui.setAsk(false);ui.setNotes(true);
  }
  const favourites = useMemo(() => {
    const pinned = new Set(data.preferences.filter((pref) => pref.fields.pinned === true).map((pref) => String(pref.fields.app)));
    return NAV_GROUPS.flatMap((group) => group.apps).filter((app) => pinned.has(app.short) && canOpen(role, app.code));
  }, [data.preferences, role]);

  const activePreference = data.preferences.find((item) => item.fields.app === APP_ENTRIES[activeCode]?.short);
  const activePinned = activePreference?.fields.pinned === true;

  function chooseRoleView(nextRole: Role) {
    ui.setRole(nextRole);
    // A role view is not authentication. Avoid stranding the user on a
    // native application hidden by the new local navigation perspective.
    if (activeScreen && !canOpen(nextRole, activeScreen.applicationCode)) {
      navigate(nextRole === "client" ? appEntry("PORTAL", org.slug) : workAreaPath(org.slug, "home"));
    }
  }

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
        openCommand();
        return;
      }
      if (!typing && event.key === "/" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        openCommand();
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

  useEffect(() => {ui.setCommand(false);ui.setAsk(false);ui.setNotes(false);}, [org.id]);

  useEffect(() => {
    recordNavigation(org.id, org.slug, location.pathname);
  }, [org.id, org.slug, location.pathname]);

  useEffect(() => {
    try { localStorage.setItem("arlovi-last-workspace", org.slug); } catch { /* optional local preference */ }
  }, [org.slug]);

  return (
    <div className="hq" data-context={contextVisible ? "true" : "false"} data-nav-open={navOpen ? "true" : "false"}
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
          label="Switch company"
          align="start"
          trigger={
            <button type="button" className="hq-orgswitch">
              <span className="ds-sr-only">Switch company, current </span>
              <span className="hq-orgdot" style={{ background: org.accent }}>{org.shortName.slice(0, 1)}</span>
              <span className="name ds-truncate" aria-hidden="true">{org.name}</span>
              <span className="ds-sr-only">{org.name}</span>
              <ChevronDown size={14} />
            </button>
          }
          items={[
            ...ORGS.map((item) => ({
              label: item.id === org.id ? `${item.name} · current` : item.name,
              group: "Companies in this browser",
              onSelect: () => navigate(destinationForOrganization(location.pathname, location.search, item.slug)),
            })),
            { label: "Companies here are browser-local; cloud access is not connected", group: "Company access", disabled: true, separatorBefore: true },
            { label: "Company overview", group: "Company access", onSelect: () => navigate(`/o/${org.slug}/workspace/company`) },
            { label: "Create another company", group: "Company access", onSelect: () => navigate("/setup") },
          ]}
        />

        <div className="hq-header-context-inline" aria-label="Current area">
          <span className="hq-header-divider" aria-hidden="true"/>
          <span className="hq-header-area">{isWorkspaceArea ? WORK_AREAS.find(item => item.id === activeArea)?.label : appModule?.short ?? activeScreen?.applicationName ?? "Workspace"}</span>
        </div>
        <span className="ds-grow" />

        <button ref={searchTrigger} type="button" className="hq-search" onClick={openCommand} aria-keyshortcuts="Control+K Meta+K">
          <Search size={15} aria-hidden="true" />
          <span className="ds-sr-only">Search anything in {org.shortName}</span>
          <span className="ds-grow hq-search-label" aria-hidden="true" style={{ textAlign: "start" }}>Search anything in {org.shortName}</span>
          <kbd className="ds-kbd">{keyboardHint}</kbd>
        </button>

        <Button variant="primary" size="sm" icon={<Sparkles size={15} />} aria-label={brand.ask} onClick={openAsk}>
          <span className="hq-hide-sm">{brand.ask}</span>
        </Button>

        <div className="hq-header-utils" role="group" aria-label="Inbox and notifications">
          <div className="hq-bell">
            <Button variant="ghost" size="sm" iconOnly aria-label={`Inbox and decisions, ${decisions} awaiting action`} aria-expanded={ui.notes && attentionView === "approvals"} onClick={() => openAttention("approvals")}>
              <Inbox size={17}/>
            </Button>
            {decisions > 0 && <span className="hq-bell-count" aria-hidden="true">{decisions > 99 ? "99+" : decisions}</span>}
          </div>
          <div className="hq-bell">
            <Button variant="ghost" size="sm" iconOnly aria-label={`Notifications, ${updates} unread updates`} aria-expanded={ui.notes && attentionView === "updates"} onClick={() => openAttention("updates")}>
              <Bell size={17}/>
            </Button>
            {updates > 0 && <span className="hq-bell-count" aria-hidden="true">{updates > 99 ? "99+" : updates}</span>}
          </div>
        </div>

        <Menu
          label="Account and preferences"
          trigger={<Button variant="ghost" size="sm" iconOnly aria-label={`Profile and preferences. Local role view ${ROLE_LABELS[role]}`}>
            <span className="hq-profile-avatar"><UserRound size={15} aria-hidden="true"/></span>
          </Button>}
          items={[
            {label: `${org.ownerName ?? "Local workspace profile"} · ${org.name}`, group:"Account (browser-local)", disabled:true},
            {label:"Account & data readiness",group:"Account",onSelect:()=>navigate(`/o/${org.slug}/workspace/account`)},
            ...(["owner", "finance", "sales", "people", "member", "client"] as Role[]).map((item) => ({
              label: item === role ? `${ROLE_LABELS[item]} · current view` : ROLE_LABELS[item],
              group: "Role view (not a security boundary)",
              onSelect: () => chooseRoleView(item),
            })),
            { label: "Take a guided tour", group: "Help", separatorBefore: true, onSelect: () => window.dispatchEvent(new Event("arlovi:start-tour")) },
            ...(activeScreen && APP_ENTRIES[activeCode] ? [{
              label: `${activePinned ? "Remove" : "Pin"} ${APP_ENTRIES[activeCode].short} ${activePinned ? "from" : "to"} favourites`,
              group: "Navigation", separatorBefore: true, onSelect: () => { void toggleFavourite(); },
            }] : []),
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


      </header>
      {contextVisible && <HeaderContextBar />}

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
              <Link className="hq-appnav-back" to={workAreaPath(org.slug, "apps")}>
                <ArrowLeft size={14} aria-hidden="true"/> All applications
              </Link>
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
                    const to = nativeNavPath(target, org.slug, activeMatch);
                    const ItemIcon = item.icon;
                    const content = <>
                      {ItemIcon && <ItemIcon size={15} />}
                      <span className="ds-truncate">{item.label}</span>
                    </>;
                    // Detail-only views are not destinations until the user
                    // opens an actual record in this company's application.
                    return to ? (
                      <NavLink key={item.screenId} to={to} end className="hq-navlink">
                        {content}
                      </NavLink>
                    ) : (
                      <span key={item.screenId} className="hq-navlink" aria-disabled="true"
                        title="Open a record in this application to access this view">
                        {content}
                      </span>
                    );
                  })}
                </div>
              ))}
              {!activeMatch?.params.id && appModule.nav.some(section => section.items.some(item => {
                const target = screens.find(screen => screen.id === item.screenId);
                return target && /:id\b/.test(target.route);
              })) && <p className="hq-appnav-help">Open a record from this app to access its detail views.</p>}
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

      {ui.command && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening search…</div>}><CommandPalette onClose={() => {ui.setCommand(false);searchTrigger.current?.focus();}} /></Suspense>}
      {ui.notes && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening attention centre…</div>}><AttentionCentre key={attentionView} initialView={attentionView} items={attention} onClose={() => ui.setNotes(false)} /></Suspense>}
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
