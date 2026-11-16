import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { Breadcrumbs, Button, Drawer, Menu, Modal, Notice, Tabs, TabPanel } from "@/design-system";
import { findScreen, type ScreenInfo } from "@/app/catalog";
import { APP_ENTRIES } from "@/app/nav";
import { getApp, type ActionDef, type ScreenContext, type ScreenDef } from "@/platform/registry";
import { can as roleCan, canOpen, ROLE_LABELS } from "@/platform/policy";
import { useMutations, useToast, useWorkspace } from "@/platform/workspace";
import { getRecordInOrg, knownRecord } from "@/platform/repo";
import { useLiveQuery } from "dexie-react-hooks";
import { applicationLoadFailures } from "@/applications";

export function ScreenHost() {
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const toast = useToast();
  const match = findScreen(location.pathname);
  const screen = match?.screen;
  const mutate = useMutations(screen?.id);
  /* The record in the address must belong to the organisation in the address.
     Ids are global, so a record from another organisation is refused here
     before any screen renders or offers an action on it. */
  const routeId = match?.params.id;
  const foreign = useLiveQuery(async () => {
    if (!routeId) return false;
    const record = await getRecordInOrg(workspace.org.id, routeId);
    // Only a scoped read is allowed to resolve a detail route. Distinguish a
    // truly missing record from an unscoped reference by checking the id through
    // the same transaction-safe repository path below.
    return record ? false : true;
  }, [routeId, workspace.org.id]);

  const [tab, setTabState] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | undefined>(match?.params.id);
  const [overlay, setOverlay] = useState<{ id: string; payload?: unknown } | null>(null);

  const tabParam = new URLSearchParams(location.search).get("tab");

  /* An overlay can be deep-linked with ?overlay=<id>, so a dialog can be
     bookmarked or shared, and so every overlay can be opened in testing. */
  const linkedOverlay = new URLSearchParams(location.search).get("overlay");

  useEffect(() => {
    setSelectedId(match?.params.id);
    setOverlay(linkedOverlay ? { id: linkedOverlay } : null);
  }, [match?.screen.id, match?.params.id, linkedOverlay]);

  const app = screen ? getApp(screen.applicationCode) : undefined;
  const def: ScreenDef | undefined = screen && app ? app.screens[screen.id] : undefined;

  const tabIds = useMemo(() => {
    if (def?.tabs?.length) return def.tabs.map((item) => item.id);
    return screen?.tabs ?? [];
  }, [def, screen]);

  const activeTab = tabIds.includes(tabParam ?? "") ? (tabParam as string) : (tab && tabIds.includes(tab) ? tab : tabIds[0] ?? "");

  const setTab = useCallback((next: string) => {
    setTabState(next);
    const params = new URLSearchParams(location.search);
    params.set("tab", next);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  const context = useMemo<ScreenContext | null>(() => {
    if (!screen) return null;
    return {
      screen,
      org: workspace.org,
      role: workspace.role,
      actor: workspace.actor,
      now: workspace.now,
      params: match?.params ?? {},
      tab: activeTab,
      setTab,
      selectedId,
      select: setSelectedId,
      openOverlay: (id, payload) => setOverlay({ id, payload }),
      closeOverlay: () => setOverlay(null),
      overlayPayload: overlay?.payload,
      navigate,
      path: (route, id) => route.replace(":org", workspace.org.slug).replace(":id", id ?? selectedId ?? "").replace(":slug", "showroom-consult"),
      toast,
      mutate,
      can: (capability) => roleCan(workspace.role, capability),
      money: workspace.money,
      date: workspace.date,
      dateTime: workspace.dateTime,
      relative: workspace.relative,
    };
  }, [screen, workspace, match?.params, activeTab, setTab, selectedId, overlay, navigate, toast, mutate]);

  if (!screen || !context) {
    return (
      <div className="pg">
        <div className="pg-head"><h1>That address is not a workspace screen</h1></div>
        <div className="pg-body">
          <Notice tone="warning" title="Not in the screen register">
            The route <code>{location.pathname}</code> is not one of the approved 316 screens.
          </Notice>
        </div>
      </div>
    );
  }

  if (routeId && foreign === undefined) {
    return (
      <div className="pg" role="status" aria-busy="true">
        <div className="pg-head"><h1>Checking record access…</h1></div>
        <div className="pg-body"><p>Confirming this record belongs to {workspace.org.name}.</p></div>
      </div>
    );
  }

  if (foreign) {
    return (
      <div className="pg">
        <div className="pg-head"><h1>Not in {workspace.org.name}</h1></div>
        <div className="pg-body">
          <Notice tone="warning" title="This record belongs to another organisation">
            Records are kept apart per organisation. Switch organisation from the header to open it there.
          </Notice>
        </div>
      </div>
    );
  }

  if (!canOpen(workspace.role, screen.applicationCode)) {
    return (
      <div className="pg">
        <div className="pg-head">
          <Breadcrumbs items={[{ label: workspace.org.name, to: `/o/${workspace.org.slug}/hq/home` }, { label: screen.applicationName }]} />
          <h1>{screen.title}</h1>
        </div>
        <div className="pg-body">
          <Notice tone="warning" title={`Outside the ${ROLE_LABELS[workspace.role]} view`}>
            This view does not open {screen.applicationName}. Change the role view from the account menu if you are reviewing another desk.
            The role view shapes the interface; it is not an account security boundary.
          </Notice>
        </div>
      </div>
    );
  }

  if (!app) {
    const failed = applicationLoadFailures();
    if (failed.length > 0) {
      return (
        <div className="pg">
          <div className="pg-head"><h1>{screen.title}</h1></div>
          <div className="pg-body">
            <Notice tone="danger" title={`${screen.applicationName} did not load`}>
              Its application module failed to load ({failed.map((failure) => failure.group).join(", ")}). Other applications are working normally.
            </Notice>
          </div>
        </div>
      );
    }
    return <NotBuilt title={screen.title} application={screen.applicationName} />;
  }

  const actions = (def?.actions ?? []).filter((action) => !action.capability || roleCan(workspace.role, action.capability));
  const primary = actions.filter((action) => action.placement === "primary");
  const secondary = actions.filter((action) => action.placement === "secondary");
  const overflow = actions.filter((action) => action.placement === "overflow");

  const activeDefTab = def?.tabs?.find((item) => item.id === activeTab);
  const title = def?.title?.(context) ?? screen.title;
  const AppIcon = APP_ENTRIES[screen.applicationCode]?.icon;

  const content = def?.surface
    ? def.surface(context)
    : activeDefTab
      ? activeDefTab.render(context)
      : app.fallback
        ? app.fallback(context)
        : <NotBuilt title={screen.title} application={screen.applicationName} />;

  /* A tab strip always controls a panel: the tab's aria-controls must resolve,
     including on screens still served by a fallback. */
  /* Every tab strip controls a panel, full-chrome editors included: their
     surface changes with the tab, so the surface is the panel. Without the
     wrapper, an editor's tabs pointed aria-controls at nothing. */
  const body = tabIds.length > 1
    ? (
      <TabPanel
        id={activeTab}
        style={def?.chrome === "full" ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : undefined}
      >
        {content}
      </TabPanel>
    )
    : content;

  const actionBar = (
    <div className="pg-actions">
      {secondary.map((action) => <ActionButton key={action.id} action={action} context={context} variant="secondary" />)}
      {primary.map((action) => <ActionButton key={action.id} action={action} context={context} variant="primary" />)}
      {overflow.length > 0 && (
        <Menu
          label="More actions"
          trigger={<Button variant="ghost" iconOnly aria-label="More actions"><MoreHorizontal size={18} /></Button>}
          items={overflow.map((action) => ({
            label: action.label ?? action.id,
            group: action.group,
            tone: action.tone,
            disabled: Boolean(action.guard?.(context)),
            onSelect: () => { void action.run(context); },
          }))}
        />
      )}
    </div>
  );

  if (def?.chrome === "full") {
    /* Editors and consoles own their canvas, but their contract actions must
       still be reachable in one consistent place: a slim command bar. Without
       it, a full-chrome screen showed no actions at all unless its team
       happened to duplicate them into its own toolbar. */
    return (
      <div className="pg">
        <div className="pg-cmdbar" role="region" aria-label={`${title} actions`}>
          <h1 className="pg-cmdbar-title ds-truncate">{title}</h1>
          <span className="ds-grow" />
          {actions.length > 0 && actionBar}
        </div>
        {body}
        <ScreenOverlays context={context} def={def} overlayId={overlay?.id} onClose={() => setOverlay(null)} />
      </div>
    );
  }

  const page = (
    <div className="pg">
      <header className="pg-head">
        <Breadcrumbs
          items={[
            { label: workspace.org.shortName, to: `/o/${workspace.org.slug}/hq/home` },
            { label: APP_ENTRIES[screen.applicationCode]?.short ?? screen.applicationName, to: context.path(screen.route.split("/").slice(0, 4).join("/") + (screen.route.split("/").length > 4 ? "" : "")) },
            { label: title },
          ]}
        />
        <div className="pg-titlerow">
          <div className="pg-title">
            <h1>
              {AppIcon && <AppIcon size={0} />}
              {title}
            </h1>
            {def?.subtitle
              ? <div className="pg-lede">{def.subtitle(context)}</div>
              : def
                ? null
                : <p className="pg-lede">{screen.purpose}</p>}
          </div>
          {actionBar}
        </div>
      </header>

      {def?.header?.(context)}

      {tabIds.length > 1 && (
        <div className="pg-tabs">
          <Tabs
            label={`${title} views`}
            value={activeTab}
            onChange={setTab}
            items={tabIds.map((id) => {
              const found = def?.tabs?.find((item) => item.id === id);
              return { id, label: found?.label ?? id, count: found?.count?.(context) };
            })}
          />
        </div>
      )}

      {def?.statusStrip && <div className="pg-strip">{def.statusStrip(context)}</div>}

      <div className="pg-body" data-pad={def?.surface ? "none" : undefined}>{body}</div>

      <ScreenOverlays context={context} def={def} overlayId={overlay?.id} onClose={() => setOverlay(null)} />
    </div>
  );

  if (def?.inspector) {
    return (
      <div className="pg-split">
        {page}
        <aside className="ds-inspector" aria-label={def.inspectorTitle ?? "Inspector"}>
          <div className="ds-inspector-head"><h3 className="ds-grow">{def.inspectorTitle ?? "Details"}</h3></div>
          <div className="ds-inspector-body">{def.inspector(context)}</div>
        </aside>
      </div>
    );
  }

  return page;
}

/**
 * Rendered at module level, not inside ScreenHost. Defined inside, it would be
 * a new component type on every render, so React would remount the open
 * dialog and discard whatever a person had typed into it — including on the
 * workspace clock's minute tick.
 */
/**
 * A screen in the approved contract that its application has not implemented.
 * The contract test keeps this unreachable; if it ever shows, it says so
 * plainly rather than falling back to a generic page.
 */
function NotBuilt({ title, application }: { title: string; application: string }) {
  return (
    <div className="pg">
      <div className="pg-head"><h1>{title}</h1></div>
      <div className="pg-body">
        <Notice tone="warning" title="This screen is not built yet">
          {title} is in the approved contract for {application} but has no implementation. It is recorded as outstanding in the implementation ledger.
        </Notice>
      </div>
    </div>
  );
}

function ScreenOverlays({ context: ctx, def: screenDef, overlayId, onClose }: { context: ScreenContext; def?: ScreenDef; overlayId?: string; onClose: () => void }) {
  const found = screenDef?.overlays?.find((item) => item.id === overlayId);
  if (!overlayId) return null;
  if (!found) {
    return (
      <Modal open onOpenChange={onClose} title={overlayId} width={480}>
        <Notice tone="warning" title="This overlay is not implemented yet">
          {overlayId} is in the approved contract for {ctx.screen.title} but has not been built. It is recorded as outstanding in the implementation ledger rather than shown as a generic form.
        </Notice>
      </Modal>
    );
  }
  const overlayContext = { ...ctx, close: onClose };
  const payloadId = (ctx.overlayPayload as { id?: unknown } | undefined)?.id;
  const ids = [typeof payloadId === "string" ? payloadId : undefined, ctx.selectedId, ctx.params.id].filter((id): id is string => Boolean(id));
  const body = <PrimedOverlayBody ids={ids} orgId={ctx.org.id} render={() => found.render(overlayContext)} />;
  const overlayTitle = typeof found.title === "function" ? found.title(ctx) : found.title ?? found.id;
  if (found.kind === "drawer") {
    return (
      <Drawer open onOpenChange={(next) => { if (!next) onClose(); }} title={overlayTitle} subtitle={found.description} width={found.width ?? 440} footer={found.footer?.(overlayContext)}>
        {body}
      </Drawer>
    );
  }
  return (
    <Modal
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={overlayTitle}
      description={found.description}
      width={found.width ?? 560}
      tone={found.tone}
      blocking={found.blocking}
      footer={found.footer?.(overlayContext)}
    >
      {body}
    </Modal>
  );
}

/**
 * Mounts an overlay's body only once the records it is about have been read,
 * so a form that seeds its fields from a record sees the record on its first
 * render. Most opens are already primed by the list they came from; a deep
 * link waits for one indexed read.
 */
function PrimedOverlayBody({ ids, orgId, render }: { ids: string[]; orgId: string; render: () => ReactNode }) {
  const key = ids.join("|");
  const ready = useLiveQuery(async () => {
    await Promise.all(ids.map((id) => getRecordInOrg(orgId, id)));
    return true;
  }, [key, orgId], ids.every((id) => {
    const cached = knownRecord(id);
    return cached !== undefined && cached.organizationId === orgId;
  }) || ids.length === 0);
  if (!ready) return <div className="ds-muted" role="status">Loading…</div>;
  return <OverlayBody render={render} />;
}

function OverlayBody({ render }: { render: () => ReactNode }) {
  return <>{render()}</>;
}


function ActionButton({ action, context, variant }: { action: ActionDef; context: ScreenContext; variant: "primary" | "secondary" }) {
  const [busy, setBusy] = useState(false);
  const blocked = action.guard?.(context);
  return (
    <Button
      variant={action.tone === "danger" ? "outline-danger" : variant}
      icon={action.icon}
      busy={busy}
      disabled={Boolean(blocked)}
      title={blocked}
      onClick={async () => {
        setBusy(true);
        try { await action.run(context); } finally { setBusy(false); }
      }}
    >
      {action.label ?? action.id}
    </Button>
  );
}

export type { ScreenInfo };
