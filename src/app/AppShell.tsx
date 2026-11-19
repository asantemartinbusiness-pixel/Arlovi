import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, Menu as MenuIcon, Sparkles, Search, Bell, Inbox, X } from "lucide-react";
import { Button, Pill, Row } from "@/design-system";
import { Menu } from "@/design-system/overlays";
import { ArloviMark, brand } from "@/app/brand";
import { foregroundOnBrand } from "@/design-system/brandColor";
import { NAV_GROUPS, APP_ENTRIES } from "@/app/nav";
import { appEntry, findScreen, nativeNavPath, screens } from "@/app/catalog";
import { destinationForOrganization } from "@/app/organizationNavigation";
import { ScreenHost } from "@/app/ScreenHost";
import { FirstRunGuide } from "@/app/FirstRunGuide";
import { RoleFirstRun } from "@/app/RoleFirstRun";
import { GuidedTour } from "@/app/GuidedTour";
import { WORK_AREAS, WorkspaceNavigation, WorkspaceSideNav, currentWorkArea, isWorkAreaPath, workAreaPath } from "@/app/WorkspaceNavigation";
import { ScreenErrorBoundary } from "@/app/ErrorBoundary";
import { applicationLoadFailures, loadNativeApplication, prefetchNativeApplication } from "@/applications";
const CommandPalette = lazy(() => import("@/app/CommandPalette").then(module => ({ default: module.CommandPalette })));
import { recordNavigation, readNavigation } from "@/platform/navigationContinuity";
import { readAppJourney, recordAppJourney, rememberedAppRoute, previousJourney, scopedJourneyUrl, emptyJourney, type AppJourney, type JourneyEntry } from "@/platform/appJourney";
import { IntentPrefetchController } from "@/app/nativePrefetch";
const AttentionCentre = lazy(() => import("@/app/AttentionCentre").then(module => ({ default: module.AttentionCentre })));
const AskPanel = lazy(() => import("@/app/AskPanel").then(module => ({ default: module.AskPanel })));
import { ExecutionTray } from "@/app/ExecutionTray";
import { HeaderContextBar } from "@/app/HeaderContextBar";
import { getApp, useApplicationRegistryRevision } from "@/platform/registry";
import { canOpen } from "@/platform/policy";
import { canOpenLegacyScreen } from "@/platform/accessInventory";
import { ORGS } from "@/platform/org";
import { useCollections, useWorkspace, useMutations } from "@/platform/workspace";
import { buildAttention, filterForRole, headerAttentionCounts } from "@/platform/attention";
import { DEFAULT_NOTIFICATION_PREFERENCES, isUrgent, mayInterrupt } from "@/platform/notificationPolicy";
import { applyAttentionReceipts } from "@/platform/attentionReceipts";
import { useUi } from "@/runtime/ui";
import { DisplayPreferences } from "@/app/DisplayPreferences";
import { NotificationToastStack } from "@/app/NotificationToastStack";
import { NotificationBanner } from "@/app/NotificationBanner";
import { ProfileMenu } from "@/app/ProfileMenu";
import { TemporaryDraftCounter } from "@/app/WorkingDraftStatus";
import type { Role } from "@/domain/types";
import "@/app/shell.css";

export function AppShell() {
  useApplicationRegistryRevision();
  const ui = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const { org, role, actor, now } = useWorkspace();
  const mutate = useMutations();
  const [navOpen, setNavOpenState] = useState(false);
  /* The path the drawer was opened on. Route changes close the drawer, but the
     close runs after React renders the new route; a person who reopens the
     drawer in that gap (a slow device, an application still loading) must not
     have it shut underneath them. */
  const navOpenedAt = useRef<string | null>(null);
  const setNavOpen = useCallback((open: boolean) => {
    navOpenedAt.current = open ? window.location.pathname : null;
    setNavOpenState(open);
  }, []);
  const [displayOpen, setDisplayOpen] = useState(false);
  const closeDisplay = useCallback(() => setDisplayOpen(false), []);
  const [attentionView, setAttentionView] = useState<"for-you" | "approvals" | "updates" | "settings">("for-you");
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const keyboardHint = typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent) ? "⌘K" : "Ctrl+K";

  const isWorkspaceArea = isWorkAreaPath(location.pathname, org.slug);
  const activeArea = currentWorkArea(location.pathname);
  const activeMatch = useMemo(() => findScreen(location.pathname), [location.pathname]);
  const activeScreen = activeMatch?.screen;
  const activeCode = activeScreen?.applicationCode ?? "HQ";
  const appModule = getApp(activeCode);
  /* One journey per organisation, role and person, scoped to this browser tab.
     Cross-app links, not just rail clicks, participate in this history. */
  const journeyScope = `${org.id}:${role}:${actor}`;
  const journeyUrl = location.pathname + location.search + location.hash;
  const currentJourneyApp = isWorkspaceArea ? `WS:${activeArea}` : activeScreen?.applicationCode ?? null;
  const [journeyView, setJourneyView] = useState<{ scope: string; state: AppJourney }>(() => ({
    scope: journeyScope, state: readAppJourney(journeyScope, org.slug),
  }));
  const journey = journeyView.scope === journeyScope ? journeyView.state : emptyJourney();
  useEffect(() => {
    if (!currentJourneyApp) {
      setJourneyView({ scope: journeyScope, state: readAppJourney(journeyScope, org.slug) });
      return;
    }
    setJourneyView({
      scope: journeyScope,
      state: recordAppJourney(journeyScope, org.slug, currentJourneyApp, journeyUrl),
    });
  }, [journeyScope, org.slug, currentJourneyApp, journeyUrl]);

  function canReturnTo(entry: JourneyEntry): boolean {
    if (!scopedJourneyUrl(entry.url, org.slug)) return false;
    const targetPath = entry.url.split(/[?#]/)[0];
    if (entry.app.startsWith("WS:")) {
      return targetPath.startsWith(`/o/${org.slug}/workspace/`)
        && entry.app === `WS:${currentWorkArea(targetPath)}`;
    }
    const destination = findScreen(targetPath)?.screen;
    return !!destination && destination.applicationCode === entry.app
      && canOpenLegacyScreen(role, destination);
  }
  function resumeNativeApp(code: string): string {
    const fallback = appEntry(code, org.slug);
    const remembered = rememberedAppRoute(journey, org.slug, code);
    return remembered && canReturnTo({ app: code, url: remembered }) ? remembered : fallback;
  }
  const recentAppCodes = [...new Set([...journey.trail].reverse().map(item => item.app))]
    .filter(code => !code.startsWith("WS:") && APP_ENTRIES[code] && canOpen(role, code)).slice(0, 5);
  const pendingReturn = journey.trail.at(-1)?.app === currentJourneyApp ? previousJourney(journey) : null;
  const returnTo = pendingReturn && canReturnTo(pendingReturn) ? pendingReturn : null;
  const returnName = returnTo
    ? returnTo.app.startsWith("WS:")
      ? WORK_AREAS.find(area => `WS:${area.id}` === returnTo.app)?.label ?? "Workspace"
      : APP_ENTRIES[returnTo.app]?.short ?? "Previous app"
    : "";
  const returnScreen = returnTo ? findScreen(returnTo.url.split(/[?#]/)[0])?.screen : null;

  const activeGroup = NAV_GROUPS.find(group => group.apps.some(app => app.code === activeCode));
  // Return to the active native application category without carrying record IDs.
  const contextualCategory = activeGroup?.label ?? null;
  const appDirectoryPath = contextualCategory
    ? `${workAreaPath(org.slug, "apps")}?category=${contextualCategory}`
    : workAreaPath(org.slug, "apps");
  const relatedPeers = contextualCategory && activeGroup
    ? activeGroup.apps.filter(app => app.code !== activeCode && canOpen(role, app.code))
    : [];

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
      .find(screen => screen && screen.applicationCode !== "HQ" && canOpenLegacyScreen(role, screen));
    if (candidate) prefetchController.schedule(candidate.applicationCode, 5000);
    return () => prefetchController.cancel();
  }, [location.pathname, org.id, org.slug, role, prefetchController]);

  function linkedApplicationCode(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const link = target.closest("a[href]");
    if (!(link instanceof HTMLAnchorElement) || !link.pathname.startsWith(`/o/${org.slug}/`)) return null;
    const screen = findScreen(link.pathname)?.screen;
    if (!screen || screen.applicationCode === activeScreen?.applicationCode || !canOpenLegacyScreen(role, screen)) return null;
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
  }), role), ui.attentionReceipts, org.id, role, actor, now), [data, org.slug, org.id, now, role, actor, ui.attentionReceipts]);
  const contextVisible = isWorkspaceArea && ["project","department"].includes(location.pathname.split("/")[5]);
  const {decisions, unreadUpdates: updates} = headerAttentionCounts(attention);
  // Start from the current feed. Only events arriving after this view mounts may
  // produce transient feedback; loading historical notifications never spams toasts.
  const arrivalTracker = useRef<{ scope: string; seen: Set<string> } | null>(null);
  useEffect(() => {
    const scope = `${org.id}:${encodeURIComponent(actor)}:${role}`;
    if (!arrivalTracker.current || arrivalTracker.current.scope !== scope) {
      arrivalTracker.current = { scope, seen: new Set(attention.map(item => item.id)) };
      return;
    }
    const fresh = attention.filter(item => !arrivalTracker.current!.seen.has(item.id));
    fresh.forEach(item => arrivalTracker.current!.seen.add(item.id));
    const personal = ui.notificationSettings[`${org.id}:${encodeURIComponent(actor)}`] ?? DEFAULT_NOTIFICATION_PREFERENCES;
    const eligible = fresh.filter(item => mayInterrupt(item, personal,
      Boolean(item.route) && item.route!.split("?")[0] === location.pathname));
    if (!eligible.length) return;
    const mostImportant = [...eligible].sort((a,b)=>a.priority.localeCompare(b.priority))[0];
    const privateSummary = personal.preview === "private";
    ui.pushToast({
      title: privateSummary ? (isUrgent(mostImportant.priority) ? "Urgent notification" : "New notification") : mostImportant.title,
      body: privateSummary ? `${eligible.length} new item(s) need your attention. Open notifications to review.`
        : eligible.length > 1 ? `${eligible.length} new updates · ${mostImportant.body}` : mostImportant.body,
      tone: isUrgent(mostImportant.priority) ? "blocked" : "info",
      durationMs: isUrgent(mostImportant.priority) ? 0 : 6000,
      actionLabel: "Review",
      onAction: () => { setAttentionView(mostImportant.kind === "approval" || mostImportant.kind === "assignment" ? "approvals" : "updates");
        ui.setCommand(false); ui.setAsk(false); ui.setNotes(true); },
    });
  }, [attention, org.id, actor, role, location.pathname, ui.notificationSettings, ui.pushToast, ui.setNotes, ui.setAsk, ui.setCommand]);
  function openCommand() { ui.setAsk(false); ui.setNotes(false); ui.setCommand(true); }
  function openAsk() { ui.setCommand(false); ui.setNotes(false); ui.setAsk(true); }
  function openAttention(view: "for-you" | "approvals" | "updates" | "settings") {
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
    if (activeScreen && !canOpenLegacyScreen(nextRole, activeScreen)) {
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
    if (navOpenedAt.current !== location.pathname) setNavOpen(false);
    const container = document.querySelector<HTMLElement>(".hq-scroll");
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

  /* Save and restore page scroll by actual route and tab. No document or form
     contents enter storage; this map exists only for the current mounted shell. */
  const scrollByRoute = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    const container = document.querySelector<HTMLElement>(".hq-scroll");
    if (!container) return;
    const key = `${org.id}:${journeyUrl}`;
    container.scrollTop = scrollByRoute.current.get(key) ?? 0;
    const remember = () => scrollByRoute.current.set(key, container.scrollTop);
    container.addEventListener("scroll", remember, { passive: true });
    return () => { remember(); container.removeEventListener("scroll", remember); };
  }, [org.id, journeyUrl]);

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
              <span className="hq-orgdot" style={{ background: org.accent, color: foregroundOnBrand(org.accent) }}>{org.shortName.slice(0, 1)}</span>
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

        <TemporaryDraftCounter orgId={org.id} actor={actor} />
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

        <ProfileMenu
          onRoleViewChange={chooseRoleView}
          onOpenDisplay={() => setDisplayOpen(true)}
          onOpenNotificationPreferences={() => openAttention("settings")}
          onStartTour={() => window.dispatchEvent(new Event("arlovi:start-tour"))}
          activeApplication={activeScreen && APP_ENTRIES[activeCode] ? {
            name: APP_ENTRIES[activeCode].short,
            pinned: activePinned,
            onToggleFavourite: () => { void toggleFavourite(); },
          } : undefined}
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
              return <Link key={app.code} to={resumeNativeApp(app.code)}
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
              <Link className="hq-appnav-back" to={appDirectoryPath}>
                <ArrowLeft size={14} aria-hidden="true"/> All applications
              </Link>
              <Row gap={2}>
                <appModule.icon size={18} strokeWidth={1.9} />
                <h2 className="ds-grow ds-truncate">{appModule.short}</h2>
              </Row>
              <p>{appModule.purpose}</p>
              <details className="hq-app-switch">
                <summary>Switch application <ChevronDown size={14} aria-hidden="true" /></summary>
                <div className="hq-app-switch-list" role="group" aria-label="Recently visited applications">
                  {recentAppCodes.filter(code => code !== activeCode).map(code => {
                    const item = APP_ENTRIES[code];
                    const Icon = item.icon;
                    return <Link key={code} to={resumeNativeApp(code)} onClick={event => {
                      const details = event.currentTarget.closest("details");
                      if (details) details.open = false;
                    }}><Icon size={15} aria-hidden="true"/><span className="ds-truncate">{item.short}</span><span className="ds-sr-only">, resume last screen</span></Link>;
                  })}
                  <Link to={workAreaPath(org.slug,"apps")} onClick={event => {
                    const details = event.currentTarget.closest("details");
                    if (details) details.open = false;
                  }}><MenuIcon size={15} aria-hidden="true"/>All applications</Link>
                </div>
              </details>
            </div>
            <div className="hq-appnav-body">
              {appModule.nav.map((section) => (
                <div key={section.label ?? "root"}>
                  {section.label && <div className="hq-navsection">{section.label}</div>}
                  {section.items.map((item) => {
                    const target = screens.find((screen) => screen.id === item.screenId);
                    if (!target || !canOpenLegacyScreen(role, target)) return null;
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
              {relatedPeers.length > 0 && (
                <details className="hq-appnav-related">
                  <summary>Other {contextualCategory} apps <ChevronDown size={15} aria-hidden="true" /></summary>
                  <div className="hq-appnav-related-links">
                    {relatedPeers.map(peer => {
                      const PeerIcon = peer.icon;
                      return <Link key={peer.code} to={resumeNativeApp(peer.code)} className="hq-navlink">
                        <PeerIcon size={15} />
                        <span className="ds-truncate">{peer.short}</span>
                      </Link>;
                    })}
                  </div>
                </details>
              )}
            </div>
          </nav>
        )}

        <main className="hq-main" id="main">
          {returnTo && <nav className="hq-journey-bar" aria-label="Return to previous workspace">
            <button type="button" className="hq-journey-return" onClick={() => navigate(returnTo.url)}
              title={`Return to ${returnName} at your previous position`}>
              <ArrowLeft size={16} aria-hidden="true"/>
              <span>Back to <strong>{returnName}</strong></span>
            </button>
            {returnScreen && <span className="hq-journey-page ds-truncate">{returnScreen.title}</span>}
            <span className="hq-journey-context">Screen &amp; tab remembered</span>
          </nav>}
          {/* The page scrolls here, above the tray, so the tray never covers content. */}
          <div className="hq-scroll">
          {applicationLoadFailures().length > 0 && (
            <div className="hq-banners">
              <NotificationBanner tone="danger" title="Some applications could not be loaded">
                {applicationLoadFailures().map(failure => `${failure.group}: ${failure.message}`).join(" · ")}
                {" "}Other applications remain available.
              </NotificationBanner>
            </div>
          )}
          {(ui.offline || paused) && (
            <div className="hq-banners">
              {ui.offline && <NotificationBanner tone="info" title="Working offline">
                Your browser-local workspace remains accessible. External actions cannot be confirmed.
              </NotificationBanner>}
              {paused && <NotificationBanner tone="warning" title="Mission dispatch is paused"
                action={role === "owner" ? <Button size="sm" onClick={() => mutate.patch(org.id, {
                  fields: { ...data.organizations.find(item => item.id === org.id)?.fields, executionPaused: false }
                }, { event: "Mission dispatch resumed" })}>Resume dispatch</Button> : undefined}>
                New autonomous steps will not start. Already accepted external actions cannot be confirmed here.
              </NotificationBanner>}
            </div>
          )}
          {org.ownerName && (location.pathname === `/o/${org.slug}/hq/home` || location.pathname === workAreaPath(org.slug,"home")) && <FirstRunGuide />}
          {org.ownerName && (location.pathname === `/o/${org.slug}/hq/home` || location.pathname === workAreaPath(org.slug,"home")) && <RoleFirstRun key={org.id + ":" + role} />}
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

      {displayOpen && <DisplayPreferences onClose={closeDisplay} />}
      {ui.command && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening search…</div>}><CommandPalette onClose={() => {ui.setCommand(false);searchTrigger.current?.focus();}} /></Suspense>}
      {ui.notes && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening attention centre…</div>}><AttentionCentre key={attentionView} initialView={attentionView} items={attention} onClose={() => ui.setNotes(false)} /></Suspense>}
      {ui.ask && <Suspense fallback={<div className="hq-overlay-pending" role="status">Opening assistant…</div>}><AskPanel onClose={() => ui.setAsk(false)} seed={ui.askSeed} /></Suspense>}

      <NotificationToastStack />
    </div>
  );
}

export function ShellStatusPill({ tone, children }: { tone: "success" | "warning" | "danger" | "info"; children: string }) {
  return <Pill tone={tone} dot>{children}</Pill>;
}

export { ArloviMark };
export const SHELL_REF = { current: null as HTMLDivElement | null };
void useRef;
