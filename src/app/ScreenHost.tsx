import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { OverlayOrigin, OverlayRecordContext, nativeOverlayDomain } from "@/app/OverlayExperience";
import "@/app/native-overlay-experience.css";
import { Breadcrumbs, Button, Drawer, Menu, Modal, Notice, Tabs, TabPanel, RecordHeader, OVERLAY_WIDTH } from "@/design-system";
import { appEntry, findScreen, type ScreenInfo } from "@/app/catalog";
import { runNativeScreenAction } from "@/app/screenActions";
import { APP_ENTRIES } from "@/app/nav";
import { getApp, useApplicationRegistryRevision, type ActionDef, type ScreenContext, type ScreenDef } from "@/platform/registry";
import { can as roleCan, canOpen, ROLE_LABELS } from "@/platform/policy";
import { canOpenLegacyScreen, accessDescriptor } from "@/platform/accessInventory";
import { useMutations, useToast, useWorkspace } from "@/platform/workspace";
import { getRecord, getRecordInOrg, knownRecord } from "@/platform/repo";
import { useLiveQuery } from "dexie-react-hooks";
import { applicationLoadFailures, applicationStatus, loadNativeApplication } from "@/applications";

export function ScreenHost() {
  useApplicationRegistryRevision();
  const location = useLocation();
  const navigate = useNavigate();
  // The route transition and modal closing may happen in the same callback.
  // Do not let closing the old deep-linked overlay navigate back to its route.
  const routeChangePending = useRef(false);
  const workspace = useWorkspace();
  const toast = useToast();
  const match = findScreen(location.pathname);
  const screen = match?.screen;
  const mutate = useMutations(screen?.id);
  const screenVisible = screen ? canOpenLegacyScreen(workspace.role, screen) : false;
  /* The record in the address must belong to the organisation in the address.
     Ids are global, so a record from another organisation is refused here
     before any screen renders or offers an action on it. */
  const routeId = screenVisible ? match?.params.id : undefined;
  const recordAccess = useLiveQuery(async () => {
    if (!routeId) return "not_applicable" as const;
    // Resolve the record before mounting any page-specific editor or inspector.
    // Missing IDs must never silently show the first record in a list.
    const record = await getRecord(routeId);
    if (!record) return "missing" as const;
    return record.organizationId === workspace.org.id ? "allowed" as const : "foreign" as const;
  }, [routeId, workspace.org.id]);

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
    if (def?.tabs?.length) return def.tabs
      .filter((item) => !item.capability || roleCan(workspace.role, item.capability))
      .map((item) => item.id);
    return screen?.tabs ?? [];
  }, [def, screen, workspace.role]);

  // The URL is the only tab state. A tab from another native screen must not
  // silently carry over when the destination has no ?tab= parameter.
  const activeTab = tabIds.includes(tabParam ?? "") ? (tabParam as string) : tabIds[0] ?? "";

  const setTab = useCallback((next: string) => {
    if (!tabIds.includes(next)) return;
    const params = new URLSearchParams(location.search);
    params.set("tab", next);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [location.pathname, location.search, navigate, tabIds]);

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
      openOverlay: (id, payload) => {
        routeChangePending.current = false;
        setOverlay({ id, payload });
        // Only opted-in draft-safe, payload-free editors are deep-linked.
        // Other overlays may require private payloads or explicit save/discard.
        const isResumable = (screen.applicationCode === "FIN" && id === "New invoice")
          || (screen.applicationCode === "PROJECT" && ["create project", "Project template", "new task"].includes(id))
          || (screen.applicationCode === "CRM" && ["Contact form", "new lead"].includes(id))
          || (screen.applicationCode === "HR" && ["new position", "profile editor"].includes(id))
          || (screen.applicationCode === "DOCS" && id === "New doc")
          || (screen.applicationCode === "DESIGN" && id === "File setup")
          || (screen.applicationCode === "PRESENT" && id === "create layout");
        if (isResumable && payload === undefined && linkedOverlay !== id) {
          const query = new URLSearchParams(location.search);
          query.set("overlay", id);
          navigate(`${location.pathname}?${query.toString()}${location.hash}`, { replace: true });
        }
      },
      closeOverlay: () => {
        setOverlay(null);
        if (linkedOverlay && !routeChangePending.current) {
          const query = new URLSearchParams(location.search);
          query.delete("overlay");
          const suffix = query.toString();
          navigate(`${location.pathname}${suffix ? `?${suffix}` : ""}${location.hash}`, { replace: true });
        }
      },
      overlayPayload: overlay?.payload,
      navigate: (path) => {
        const current = location.pathname + location.search + location.hash;
        if (path !== current) routeChangePending.current = true;
        navigate(path);
      },
      path: (route, id) => route.replace(":org", workspace.org.slug).replace(":id", id ?? selectedId ?? "").replace(":slug", "showroom-consult"),
      toast,
      mutate,
      can: (capability) => roleCan(workspace.role, capability),
      money: workspace.money,
      date: workspace.date,
      dateTime: workspace.dateTime,
      relative: workspace.relative,
    };
  }, [screen, workspace, match?.params, activeTab, setTab, selectedId, overlay, navigate, toast, mutate,
    linkedOverlay, location.pathname, location.search, location.hash]);

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

  // Presentation guard only; the authenticated API must re-evaluate every
  // resource and action before returning data. Check before detail lookup so
  // restricted routes cannot reveal existence through this frontend flow.
  if (!screenVisible) {
    const isAppBlocked = !canOpen(workspace.role, screen.applicationCode);
    const descriptor = accessDescriptor(screen);
    return <div className="pg">
      <div className="pg-head">
        <Breadcrumbs items={[{ label: workspace.org.name, to: `/o/${workspace.org.slug}/hq/home` }, { label: screen.applicationName }]}/>
        <h1>{isAppBlocked ? "Application not available" : "Page access restricted"}</h1>
      </div>
      <div className="pg-body">
        <Notice tone="warning" title={isAppBlocked ? `Outside the ${ROLE_LABELS[workspace.role]} view` : "Additional permission required"}>
          {isAppBlocked ? "This application is not included in the selected role view." :
            `This page requires the ${descriptor.legacyCapability?.replaceAll("_"," ") ?? "relevant"} permission.`}
          {" "}Contact the organisation administrator to request access. This browser role view is not a server-side security boundary.
        </Notice>
        <Button variant="secondary" onClick={() => navigate(`/o/${workspace.org.slug}/workspace/apps`)}>
          Back to Applications
        </Button>
      </div>
    </div>;
  }

  if (routeId && recordAccess === undefined) {
    return (
      <div className="pg" role="status" aria-busy="true">
        <div className="pg-head"><h1>Checking record access…</h1></div>
        <div className="pg-body"><p>Confirming this record belongs to {workspace.org.name}.</p></div>
      </div>
    );
  }

  if (recordAccess === "missing") {
    return (
      <div className="pg">
        <div className="pg-head"><h1>Record not found</h1></div>
        <div className="pg-body">
          <Notice tone="warning" title="This record is unavailable">
            The record may have been deleted, or its link may be incorrect. No other record was substituted.
          </Notice>
          <Button variant="secondary" onClick={() => navigate(appEntry(screen.applicationCode, workspace.org.slug))}>
            Return to {screen.applicationName}
          </Button>
        </div>
      </div>
    );
  }

  if (recordAccess === "foreign") {
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


  // An application is usable once its own records are written, not merely once
  // its screens register: a board drawn first would show the workspace without them.
  if (app && applicationStatus(screen.applicationCode) === "loading") {
    return <div className="pg" role="status" aria-busy="true"><div className="pg-head"><h1>Opening {screen.applicationName}…</h1></div><div className="pg-body"><span className="ds-spinner" aria-hidden="true"/> Loading this native application.</div></div>;
  }
  if (!app) {
    const status = applicationStatus(screen.applicationCode);
    if (status === "idle" || status === "loading") return <div className="pg" role="status" aria-busy="true"><div className="pg-head"><h1>Opening {screen.applicationName}…</h1></div><div className="pg-body"><span className="ds-spinner" aria-hidden="true"/> Loading this native application.</div></div>;
    const failed = applicationLoadFailures().filter(failure => failure.group.startsWith(screen.applicationName + " / ") || failure.group.endsWith(" / " + screen.applicationCode.toLowerCase()));
    if (status === "failed") {
      return (
        <div className="pg">
          <div className="pg-head"><h1>{screen.title}</h1></div>
          <div className="pg-body">
            <Notice tone="danger" title={`${screen.applicationName} did not load`}>
              Its application module failed to load ({failed.map((failure) => failure.group).join(", ") || screen.applicationName}). Other applications remain available.
            </Notice>
            <Button variant="secondary" onClick={() => {void loadNativeApplication(screen.applicationCode).catch(() => undefined);}}>Retry loading application</Button>
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
  const recordHeader = def?.record?.(context) ?? null;

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
            onSelect: () => { void runNativeScreenAction(action, context); },
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
        {!(def.chromeTitle === "surface" && primary.length + secondary.length + overflow.length === 0) && <div className="pg-cmdbar" role="region" aria-label={`${title} actions`} data-surface-title={def.chromeTitle === "surface" ? "true" : undefined}>
          {def.chromeTitle === "surface"
            ? <span className="pg-cmdbar-title ds-truncate ds-sr-only">{title}</span>
            : <h1 className="pg-cmdbar-title ds-truncate">{title}</h1>}
          <span className="ds-grow" />
          {actions.length > 0 && actionBar}
        </div>}
        {body}
        <ScreenOverlays context={context} def={def} overlayId={overlay?.id} onClose={context.closeOverlay} />
      </div>
    );
  }

  const page = (
    <div className="pg">
      <header className="pg-head" data-record={recordHeader ? "true" : undefined}>
        <Breadcrumbs
          items={[
            { label: workspace.org.shortName, to: `/o/${workspace.org.slug}/hq/home` },
            { label: APP_ENTRIES[screen.applicationCode]?.short ?? screen.applicationName, to: appEntry(screen.applicationCode, workspace.org.slug) },
            { label: title },
          ]}
        />
        {recordHeader
          ? <RecordHeader level={1} flat {...recordHeader} eyebrow={title} actions={actions.length > 0 ? actionBar : undefined} />
          : (
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
          )}
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

      <ScreenOverlays context={context} def={def} overlayId={overlay?.id} onClose={context.closeOverlay} />
    </div>
  );

  if (def?.inspector) {
    return (
      <div className="pg-split">
        {page}
        <aside className="ds-inspector" aria-label={def.inspectorTitle ?? "Inspector"}>
          <div className="ds-inspector-head native-inspector-head">
            <div className="ds-grow">
              <OverlayOrigin context={context} />
              <h3>{def.inspectorTitle ?? "Details"}</h3>
            </div>
          </div>
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
  /* Hooks run before any early return. A required record that does not resolve
     in this organisation (or collection) also suppresses the footer action. */
  const earlyPayloadId = (ctx.overlayPayload as { id?: unknown } | undefined)?.id;
  const earlyIds = [typeof earlyPayloadId === "string" ? earlyPayloadId : undefined, ctx.params.id, ctx.selectedId].filter((id): id is string => Boolean(id));
  const earlyRequiredId = found?.presentation?.selectedRecord ? earlyIds[0] : undefined;
  const earlyCollection = found?.presentation?.collection;
  const requiredAvailable = useLiveQuery(async () => {
    if (!earlyRequiredId) return true;
    const record = await getRecordInOrg(ctx.org.id, earlyRequiredId);
    return Boolean(record && (!earlyCollection || record.collection === earlyCollection));
  }, [ctx.org.id, earlyRequiredId, earlyCollection], true);
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
  const ids = [typeof payloadId === "string" ? payloadId : undefined, ctx.params.id, ctx.selectedId].filter((id): id is string => Boolean(id));
  const requiredId = found.presentation?.selectedRecord ? ids[0] : undefined;
  /* A "choose a record first" guard must not carry an enabled footer action. */
  const guarded = Boolean(found.presentation?.selectedRecord && (!requiredId || !requiredAvailable));
  const footer = guarded ? undefined : found.footer?.(overlayContext);
  const requiredCollection = found.presentation?.collection;
  const body = found.presentation?.selectedRecord && !requiredId
    ? <Notice tone="warning" title="Choose a record first">
        Select the {nativeOverlayDomain(ctx.screen.applicationCode).entity.toLowerCase()} to work with, then open this again.
        Nothing has been changed.
      </Notice>
    : <PrimedOverlayBody ids={ids} orgId={ctx.org.id} requiredId={requiredId}
        requiredCollection={requiredCollection} render={() => found.render(overlayContext)} />;
  const overlayTitle = typeof found.title === "function" ? found.title(ctx) : found.title ?? found.id;
  const appCode = ctx.screen.applicationCode;
  const origin = <OverlayOrigin context={ctx} screenTitle={screenDef?.title?.(ctx)} />;
  const recordContext = found.summary
    ? found.summary(overlayContext)
    : found.presentation?.noRecordContext
      ? undefined
      : <OverlayRecordContext context={ctx} selection={found.presentation?.selectedRecord} collection={found.presentation?.collection} />;
  const description = found.description ?? found.presentation?.guidance;
  // This is a local presentation guard, not a substitute for authenticated API checks.
  if (found.capability && !ctx.can(found.capability)) {
    return <Modal open onOpenChange={(next) => { if (!next) onClose(); }}
      title="This action is not available in your role view" origin={origin} application={appCode}>
      <Notice tone="warning" title="Additional permission required">
        This operation needs the {found.capability.replaceAll("_", " ")} permission. The current
        browser role view cannot perform it. Ask an administrator for the required access.
      </Notice>
    </Modal>;
  }
  if (found.kind === "drawer") {
    return (
      <Drawer open onOpenChange={(next) => { if (!next) onClose(); }} title={overlayTitle} subtitle={description} origin={origin} head={recordContext} application={appCode} width={found.width ?? OVERLAY_WIDTH.compact} footer={footer}>
        {body}
      </Drawer>
    );
  }
  return (
    <Modal
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={overlayTitle}
      description={description}
      origin={origin}
      head={recordContext}
      application={appCode}
      width={found.width ?? OVERLAY_WIDTH.modal}
      tone={found.tone}
      blocking={found.blocking}
      footer={footer}
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
function PrimedOverlayBody({ ids, orgId, requiredId, requiredCollection, render }: {
  ids: string[]; orgId: string; requiredId?: string; requiredCollection?: string; render: () => ReactNode;
}) {
  const key = ids.join("|");
  const cached = ids.map(id => knownRecord(id));
  const cachedReady = cached.every(record => record !== undefined && record.organizationId === orgId)
    && (!requiredId || cached.some(record =>
      record?.id === requiredId && (!requiredCollection || record.collection === requiredCollection)));
  const state = useLiveQuery(async () => {
    const records = await Promise.all(ids.map(id => getRecordInOrg(orgId, id)));
    const selected = requiredId ? records.find(record => record?.id === requiredId) : undefined;
    if (requiredId && (!selected || (requiredCollection && selected.collection !== requiredCollection))) return "unavailable" as const;
    return "ready" as const;
  }, [key, orgId, requiredId, requiredCollection], cachedReady ? "ready" as const : undefined);
  if (!state) return <div className="ds-muted" role="status">Checking the selected record…</div>;
  if (state === "unavailable") return (
    <Notice tone="warning" title="The selected record is unavailable">
      The record was not found in this company or does not belong to this workflow.
      No other record was substituted. Return to the list and select the correct item.
    </Notice>
  );
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
        try { await runNativeScreenAction(action, context); }
        finally { setBusy(false); }
      }}
    >
      {action.label ?? action.id}
    </Button>
  );
}

export type { ScreenInfo };
