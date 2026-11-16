import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, Menu as MenuIcon, Moon, Sparkles, Sun, Search, Bell, X } from "lucide-react";
import { Button, Pill, Row } from "@/design-system";
import { Menu } from "@/design-system/overlays";
import { ArloviMark, brand, palettes } from "@/app/brand";
import { NAV_GROUPS, APP_ENTRIES, mobileNavFor } from "@/app/nav";
import { appEntry, findScreen, screens } from "@/app/catalog";
import { destinationForOrganization } from "@/app/organizationNavigation";
import { ScreenHost } from "@/app/ScreenHost";
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

export function AppShell() {
  const ui = useUi();
  const location = useLocation();
  const navigate = useNavigate();
  const { org, role, now } = useWorkspace();
  const mutate = useMutations();
  const [navOpen, setNavOpen] = useState(false);

  const activeScreen = useMemo(() => findScreen(location.pathname)?.screen, [location.pathname]);
  const activeCode = activeScreen?.applicationCode ?? "HQ";
  const appModule = getApp(activeCode);

  const data = useCollections(["notifications", "invoices", "bills", "tasks", "missions", "deals", "leaveRequests", "expenses", "organizations"]);
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

  return (
    <div className="hq" data-nav-open={navOpen ? "true" : "false"}>
      <a className="ds-skip" href="#main">Skip to content</a>

      <header className="hq-header">
        <Button variant="ghost" size="sm" iconOnly aria-label={navOpen ? "Close navigation" : "Open navigation"} className="hq-only-mobile" onClick={() => setNavOpen(!navOpen)}>
          {navOpen ? <X size={18} /> : <MenuIcon size={18} />}
        </Button>
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

        <span className="ds-grow" />

        <button type="button" className="hq-search" onClick={() => ui.setCommand(true)} aria-label={`Search ${org.shortName}`} aria-keyshortcuts="Control+K Meta+K">
          <Search size={15} />
          <span className="ds-grow" style={{ textAlign: "start" }}>Search {org.shortName}</span>
          <kbd className="ds-kbd">⌘K</kbd>
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

      <div className="hq-frame" data-appnav={appModule ? "true" : "false"}>
        <button type="button" className="hq-scrim" aria-label="Close navigation" onClick={() => setNavOpen(false)} />

        <nav className="hq-rail" aria-label="Applications">
          {NAV_GROUPS.map((group, index) => {
            const apps = group.apps.filter((app) => canOpen(role, app.code));
            if (apps.length === 0) return null;
            return (
              <div className="hq-rail-group" key={group.label}>
                {index > 0 && <span className="hq-rail-rule" aria-hidden="true" />}
                <span className="ds-sr-only">{group.label}</span>
                {apps.map((app) => {
                  const Icon = app.icon;
                  return (
                    <Link
                      key={app.code}
                      to={appEntry(app.code, org.slug)}
                      className="hq-rail-btn"
                      data-active={app.code === activeCode ? "true" : undefined}
                      title={app.short}
                      aria-label={app.short}
                      aria-current={app.code === activeCode ? "true" : undefined}
                    >
                      <Icon size={19} strokeWidth={1.8} />
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {appModule && (
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
          <ScreenErrorBoundary resetKey={location.pathname} label={activeScreen?.title ?? "This screen"}>
            <ScreenHost />
          </ScreenErrorBoundary>
          </div>
          <ExecutionTray missions={data.missions} />
        </main>
      </div>

      <nav className="hq-bottom" aria-label="Primary">
        {mobileNavFor(activeCode).map((item) => {
          const entry = APP_ENTRIES[item.code];
          const Icon = entry?.icon ?? Sparkles;
          return (
            <NavLink key={item.code} to={appEntry(item.code, org.slug)}>
              <Icon size={19} strokeWidth={1.8} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" onClick={() => setNavOpen(true)}>
          <MenuIcon size={19} />
          <span>All apps</span>
        </button>
      </nav>

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
