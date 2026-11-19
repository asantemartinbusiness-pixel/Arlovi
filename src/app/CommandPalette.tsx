import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ArrowRight, ArrowUpRight, Bookmark, BookmarkCheck, CornerUpLeft,
  FileText, FolderKanban, LayoutGrid, Plug, Search, UserRound, X, Zap,
} from "lucide-react";
import { appEntry, findScreen, screens } from "@/app/catalog";
import { APP_ENTRIES, NAV_GROUPS } from "@/app/nav";
import { buildLocalSearchHits } from "@/platform/searchRecordProviders";
import { integrationSearchHits, LOCAL_SEARCH_SOURCE } from "@/platform/searchSources";
import { canOpenLegacyScreen } from "@/platform/accessInventory";
import { canOpen } from "@/platform/policy";
import { useCollections, useOrgRecords, useWorkspace } from "@/platform/workspace";
import { toggleSavedNavigation, useNavigationContinuity } from "@/platform/navigationContinuity";
import { destinationLabel } from "@/app/WorkspaceContinuity";
import { readAppJourney, previousJourney, scopedJourneyUrl } from "@/platform/appJourney";
import { resumableApps } from "@/app/recentAppWork";
import {
  SEARCH_SCOPES, searchHits, matchingContentSnippet, type SearchHit, type SearchKind, type SearchScope,
} from "@/platform/searchModel";
import "./command-search.css";

const MAX_RECORD_RESULTS = 60;
const MAX_QUERY_LENGTH = 180;

function iconFor(kind: SearchKind) {
  if (kind === "record") return FileText;
  if (kind === "workspace") return FolderKanban;
  if (kind === "resume" || kind === "return") return CornerUpLeft;
  if (kind === "saved") return Bookmark;
  if (kind === "action") return Zap;
  if (kind === "app") return LayoutGrid;
  if (kind === "connector") return Plug;
  return ArrowUpRight;
}

function searchMemoryKey(orgId: string, actor: string): string {
  return `arlovi-search-session-v2:${encodeURIComponent(orgId)}:${encodeURIComponent(actor)}`;
}

function readSearchMemory(orgId: string, actor: string): string {
  try {
    if (typeof sessionStorage === "undefined") return "";
    return (sessionStorage.getItem(searchMemoryKey(orgId, actor)) ?? "").slice(0, MAX_QUERY_LENGTH);
  } catch { return ""; }
}

function safeLocation(to: string, slug: string): boolean {
  return scopedJourneyUrl(to, slug);
}

function recordCategory(collection: string): string {
  if (["invoices", "bills", "expenses", "journals"].includes(collection)) return "Finance";
  if (["employees", "candidates", "leaveRequests"].includes(collection)) return "People";
  if (["contacts", "companies", "deals", "quotes"].includes(collection)) return "CRM";
  if (["projects", "tasks"].includes(collection)) return "Projects";
  if (["documents", "workbooks", "decks", "designs", "knowledge"].includes(collection)) return "Files";
  return collection.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function Highlight({ text, query }: { text: string; query: string }) {
  const match = query.trim();
  if (!match) return <>{text}</>;
  const start = text.toLocaleLowerCase().indexOf(match.toLocaleLowerCase());
  if (start < 0) return <>{text}</>;
  return <>{text.slice(0, start)}<mark>{text.slice(start, start + match.length)}</mark>{text.slice(start + match.length)}</>;
}

/**
 * Navigation and local workspace-record discovery. Existing IndexedDB records
 * are scoped by organisation; the screen-access filter is UI defence only,
 * not a substitute for authenticated server-side permission checks.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { org, role, actor } = useWorkspace();
  const records = useOrgRecords();
  const spaces = useCollections(["projects", "departments"]);
  const projects = spaces.projects ?? [];
  const departments = spaces.departments ?? [];
  const navigation = useNavigationContinuity(org.id, org.slug);
  const journey = useMemo(
    () => readAppJourney(`${org.id}:${role}:${actor}`, org.slug),
    [org.id, org.slug, role, actor],
  );
  const resumable = useMemo(() => resumableApps(journey, org.slug, role, 7), [journey, org.slug, role]);
  const currentApp = findScreen(location.pathname)?.screen.applicationCode ?? "HQ";

  const [query, setQuery] = useState(() => readSearchMemory(org.id, actor));
  const [scope, setScope] = useState<SearchScope>("all");
  const [index, setIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (query) sessionStorage.setItem(searchMemoryKey(org.id, actor), query);
      else sessionStorage.removeItem(searchMemoryKey(org.id, actor));
    } catch { /* Private browsing must not break search. */ }
  }, [query, org.id, actor]);

  const candidates = useMemo<SearchHit[]>(() => {
    const currentUrl = location.pathname + location.search + location.hash;
    // A full-page route transition can paint its new heading before the
    // app-journey effect persists the destination. Use the prior app whenever
    // the current route is not yet the end of the stored trail.
    const previous = journey.trail.at(-1)?.url === currentUrl
      ? previousJourney(journey)
      : [...journey.trail].reverse().find(item => item.app !== currentApp) ?? null;
    const returnCandidate = resumable.find(item => item.to === previous?.url)
      ?? resumable.find(item => item.code !== currentApp && item.to !== currentUrl);
    const back: SearchHit[] = returnCandidate ? [{
      key: "return-to-previous-app", kind: "return", group: "Your journey",
      title: `Back to ${returnCandidate.title}`,
      detail: returnCandidate.page, to: returnCandidate.to, appCode: returnCandidate.code,
      keywords: "back return previous continue",
    }] : [];

    const continued: SearchHit[] = resumable
      .filter(item => item.to !== currentUrl)
      .map(item => ({
        key: `resume-${item.code}`, kind: "resume", group: "Continue working",
        title: item.title, detail: item.page, to: item.to, appCode: item.code,
        keywords: "resume continue working recent",
      }));

    const actions: SearchHit[] = [
      { key: "go-home", title: "Go to My Workspace", detail: "Headquarters",
        to: `/o/${org.slug}/workspace/home`, keywords: "home dashboard", appCode: "HQ" },
      { key: "go-company", title: "Open Company Headquarters", detail: "Headquarters",
        to: `/o/${org.slug}/workspace/company`, keywords: "organisation overview", appCode: "HQ" },
      { key: "go-work", title: "Open work and projects", detail: "Projects",
        to: `/o/${org.slug}/workspace/work`, keywords: "tasks projects", appCode: "PROJECT" },
      { key: "go-files", title: "Open files and resources", detail: "Documents",
        to: `/o/${org.slug}/workspace/resources`, keywords: "documents files resources", appCode: "DOCS" },
      { key: "go-people", title: "Find people and collaboration", detail: "People",
        to: `/o/${org.slug}/workspace/people`, keywords: "employees directory", appCode: "HR" },
      { key: "go-account", title: "Account and data settings", detail: "Preferences",
        to: `/o/${org.slug}/workspace/account`, keywords: "profile preferences", appCode: "HQ" },
    ].filter(item => item.appCode === "HQ" || canOpen(role, item.appCode ?? "HQ"))
      .map(item => ({ ...item, kind: "action" as const, group: "Quick actions" }));

    const locations: SearchHit[] = [
      ...navigation.pinned.map(path => ({ path, saved: true })),
      ...navigation.recent.filter(item => !navigation.pinned.includes(item.path))
        .map(item => ({ path: item.path, saved: false })),
    ].filter(item => {
      const screen = findScreen(item.path)?.screen;
      return safeLocation(item.path, org.slug) && (!screen || canOpenLegacyScreen(role, screen));
    }).map(item => ({
      key: `location-${item.path}`, kind: "saved" as const, group: item.saved ? "Saved places" : "Recently visited",
      title: destinationLabel(item.path, org.slug, projects, departments),
      detail: item.saved ? "Saved destination" : "Recently visited",
      appCode: findScreen(item.path)?.screen.applicationCode ?? "HQ",
      to: item.path,
      keywords: item.saved ? "pinned favourite saved" : "recent history",
    }));

    const apps: SearchHit[] = NAV_GROUPS.flatMap(group => group.apps)
      .filter(app => canOpen(role, app.code))
      .map(app => ({ app, to: appEntry(app.code, org.slug) }))
      .filter(item => {
        const destination = findScreen(item.to)?.screen;
        return destination && canOpenLegacyScreen(role, destination);
      }).map(({ app, to }) => ({
        key: `app-${app.code}`, kind: "app" as const, group: "Applications",
        title: app.short, detail: "Application", to, appCode: app.code,
        keywords: `open go launch ${app.short}`,
      }));

    const pages: SearchHit[] = screens
      .filter(screen => canOpenLegacyScreen(role, screen) && !/:id\b|:slug\b/.test(screen.route))
      .map(screen => ({
        key: `page-${screen.id}`, kind: "screen" as const, group: "Screens",
        title: screen.title, detail: APP_ENTRIES[screen.applicationCode]?.short ?? screen.applicationName,
        to: screen.route.replace(":org", org.slug),
        appCode: screen.applicationCode, keywords: screen.purpose,
      }));

    const rows = buildLocalSearchHits(records, {
      organizationId: org.id, organizationSlug: org.slug, actor, role,
    });
    const integrations = canOpen(role, "CONNECT") ? integrationSearchHits(org.slug) : [];

    const workspaces: SearchHit[] = [
      ...departments.map(record => ({
        key: `department-${record.id}`, kind: "workspace" as const, group: "Workspaces",
        title: record.title, detail: "Department workspace", appCode: "HQ",
        to: `/o/${org.slug}/workspace/spaces/department/${encodeURIComponent(record.id)}`,
        recordId: record.id, mine: record.ownerName === actor,
      })),
      ...projects.map(record => ({
        key: `project-${record.id}`, kind: "workspace" as const, group: "Workspaces",
        title: record.title, detail: "Project workspace", appCode: "PROJECT",
        to: `/o/${org.slug}/workspace/work/project/${encodeURIComponent(record.id)}`,
        recordId: record.id, mine: record.ownerName === actor,
      })),
    ].filter(hit => hit.appCode === "HQ" || canOpen(role, hit.appCode ?? "PROJECT"));

    return [
      ...back, ...continued,
      ...locations, ...actions,
      ...apps, ...workspaces, ...pages, ...rows, ...integrations,
    ].filter(hit => safeLocation(hit.to, org.slug));
  }, [
    location.pathname, location.search, location.hash, journey, resumable,
    navigation, org.id, org.slug, role, records, projects, departments, actor,
  ]);

  const hits = useMemo(() => {
    // Keep the opening state short; do not dump every screen in a tall menu.
    const opening = query.trim() || scope !== "all" ? candidates : [
      ...candidates.filter(hit => ["return", "resume", "saved", "action"].includes(hit.kind)).slice(0, 8),
      ...candidates.filter(hit => hit.kind === "screen").slice(0, 4),
      ...candidates.filter(hit => hit.kind === "app").slice(0, 6),
    ];
    const limit = query.trim() || scope !== "all" ? MAX_RECORD_RESULTS : 15;
    return searchHits(opening, { query, scope, activeApp: currentApp }, limit);
  }, [candidates, query, scope, currentApp]);

  useEffect(() => { setIndex(0); }, [query, scope]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  // Capture Escape before the browser's native search-field clear behaviour
  // can consume it; this also covers focused preview/scoping controls.
  useEffect(() => {
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, [onClose]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, hits]);

  const selected = hits[Math.min(index, hits.length - 1)];
  const preview = showPreview && Boolean(query.trim()) && selected;
  const previewSnippet = preview ? matchingContentSnippet(preview, query) : undefined;
  const canSave = selected && !selected.to.includes("?") && !selected.to.includes("#")
    && selected.kind !== "return" && selected.kind !== "connector";
  const isSaved = Boolean(selected && navigation.pinned.includes(selected.to));

  function go(hit?: SearchHit) {
    if (!hit || !safeLocation(hit.to, org.slug)) return;
    navigate(hit.to);
    onClose();
  }

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex(value => Math.min(value + 1, Math.max(0, hits.length - 1)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex(value => Math.max(value - 1, 0));
      return;
    }
    if (event.key === "Enter" && event.target === inputRef.current) {
      event.preventDefault(); go(selected); return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled])',
    )).filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && current <= 0) {
      event.preventDefault(); focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && current === focusable.length - 1) {
      event.preventDefault(); focusable[0].focus();
    }
  }

  let lastGroup = "";

  return (
    <div className="hq-palette-wrap search-v2-wrap" role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`hq-palette search-v2 ${query.trim() ? "search-v2--expanded" : ""}`}
        role="dialog" aria-modal="true" aria-label={`Search ${org.name}`}
        onKeyDown={onDialogKeyDown}>
        <div className="search-v2-top">
          <div className="search-v2-input-wrap">
            <Search size={21} aria-hidden="true" />
            <input className="hq-palette-input" ref={inputRef} type="search" role="combobox"
              aria-expanded="true" aria-controls="palette-list"
              aria-activedescendant={hits.length ? hits[Math.min(index, hits.length - 1)].key : undefined}
              aria-autocomplete="list" aria-label={`Search screens, records and actions in ${org.name}`}
              placeholder={`Search anything in ${org.name}`} value={query}
              maxLength={MAX_QUERY_LENGTH}
              onChange={event => setQuery(event.target.value)} />
            {query && <button type="button" className="search-v2-clear" aria-label="Clear search"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}><X size={17}/></button>}
            <button type="button" className="search-v2-close" onClick={onClose} aria-label="Close search"><X size={18}/></button>
          </div>
          <div className="search-v2-scopes" role="group" aria-label="Search within">
            {SEARCH_SCOPES.filter(item => (item.id !== "mail" || canOpen(role, "COMMS"))
              && (item.id !== "integrations" || canOpen(role, "CONNECT"))).map(item =>
              <button type="button" key={item.id} aria-pressed={scope === item.id}
                onClick={() => { setScope(item.id); inputRef.current?.focus(); }}
                title={item.id === "this-app" ? "Search the current application" : undefined}>
                {item.label}
              </button>)}
          </div>
        </div>
        {scope === "integrations" && <div className="search-v2-source-disclosure" role="note">
          <Plug size={16} aria-hidden="true"/>
          <span><strong>Integration catalogue, not connected data.</strong> These are setup options; external accounts are not searchable yet.</span>
          <button type="button" onClick={() => go({ key: "browse-integrations", kind: "connector", group: "", title: "", detail: "", to: `/o/${org.slug}/connect/marketplace` })}>
            Browse <ArrowRight size={13}/>
          </button>
        </div>}
        <div className="search-v2-body">
          <div className="hq-palette-list search-v2-results" id="palette-list" role="listbox"
            aria-label="Search results" ref={listRef}>
            <div className="search-v2-results-heading">
              <span>{query ? "SEARCH RESULTS" : "PICK UP WHERE YOU LEFT OFF"}</span>
              <span>{hits.length} {hits.length === 1 ? "result" : "results"}</span>
            </div>
            {hits.length === 0 && <div className="search-v2-empty" role="status">
              <Search size={24} aria-hidden="true"/>
              <strong>No matching results</strong>
              <p>Nothing in {org.name} matches “{query}” in this search. {scope !== "all"
                ? "Try Everything or a different search term."
                : "Try another word, a record reference or an application name."}</p>
              <button type="button" onClick={() => { setScope("all"); setQuery(""); inputRef.current?.focus(); }}>
                Reset search <ArrowRight size={15}/>
              </button>
            </div>}
            {hits.map((hit, position) => {
              const header = !query.trim() && hit.group !== lastGroup ? hit.group : null;
              lastGroup = hit.group;
              const Icon = APP_ENTRIES[hit.appCode ?? ""]?.icon ?? iconFor(hit.kind);
              return <div key={hit.key} className="search-v2-result-group">
                {header && <div className="search-v2-group-label">{header}</div>}
                <button type="button" id={hit.key} role="option"
                  aria-selected={position === index} className="hq-palette-item search-v2-hit"
                  onMouseEnter={() => setIndex(position)} onClick={() => go(hit)}>
                  <span className={`search-v2-icon search-v2-icon--${hit.kind}`}><Icon size={18}/></span>
                  <span className="search-v2-hit-copy">
                    <strong><Highlight text={hit.title} query={query}/></strong>
                    <small>{hit.detail}</small>
                    {query.trim() && matchingContentSnippet(hit, query) && <span className="search-v2-hit-snippet">
                      <Highlight text={matchingContentSnippet(hit, query) ?? ""} query={query}/>
                    </span>}
                  </span>
                  {query && <span className="search-v2-kind">{hit.kind === "connector" ? "Not connected" : hit.kind === "record" ? recordCategory(hit.collection ?? "") : hit.kind === "screen" ? "Screen" : hit.kind === "app" ? "App" : hit.kind === "action" ? "Action" : hit.group}</span>}
                  <ArrowUpRight className="search-v2-hit-arrow" size={15} aria-hidden="true"/>
                </button>
              </div>;
            })}
          </div>
          {preview && <aside className="search-v2-preview" aria-label="Selected result preview">
            <div className="search-v2-preview-title">
              <span>PREVIEW</span>
              <button type="button" aria-label="Hide preview" onClick={() => setShowPreview(false)}><X size={16}/></button>
            </div>
            <div className="search-v2-preview-icon">
              {(() => { const Icon = APP_ENTRIES[preview.appCode ?? ""]?.icon ?? iconFor(preview.kind); return <Icon size={24}/>; })()}
            </div>
            <h2>{preview.title}</h2>
            <p className="search-v2-preview-meta">{preview.detail}</p>
            <div className="search-v2-provenance">{preview.sourceType === "catalogue" ? "Integration catalogue · No external data" : (preview.sourceName ?? LOCAL_SEARCH_SOURCE)}</div>
            {previewSnippet
              ? <p className="search-v2-preview-summary search-v2-content-excerpt"><Highlight text={previewSnippet} query={query}/></p>
              : preview.summary && <p className="search-v2-preview-summary">{preview.summary.slice(0, 270)}</p>}
            {preview.status && <div className="search-v2-preview-field"><span>Status</span><strong>{preview.status.replace(/_/g, " ")}</strong></div>}
            {preview.previewFields?.map(field =>
              <div className="search-v2-preview-field" key={field.label}><span>{field.label}</span><strong>{field.value}</strong></div>
            )}
            {preview.ownerName && <div className="search-v2-preview-field"><span>Owner</span><strong>{preview.ownerName}</strong></div>}
            {preview.updatedAt && <div className="search-v2-preview-field"><span>Updated</span><strong>{new Date(preview.updatedAt).toLocaleDateString()}</strong></div>}
            <div className="search-v2-preview-actions">
              <button type="button" className="search-v2-primary" onClick={() => go(preview)}>{preview.kind === "connector" ? "Explore integration" : "Open result"} <ArrowUpRight size={15}/></button>
              {canSave && <button type="button" className="search-v2-secondary"
                onClick={() => toggleSavedNavigation(org.id, org.slug, selected.to)}>
                {isSaved ? <BookmarkCheck size={15}/> : <Bookmark size={15}/>}
                {isSaved ? "Unsave" : "Save place"}
              </button>}
            </div>
          </aside>}
        </div>
        <div className="hq-palette-foot search-v2-footer">
          <span><kbd className="ds-kbd">↑↓</kbd> navigate</span>
          <span><kbd className="ds-kbd">↵</kbd> open</span>
          <span><kbd className="ds-kbd">esc</kbd> close</span>
          {query && !showPreview && <button type="button" onClick={() => setShowPreview(true)}>Show preview</button>}
          <span className="ds-grow"/>
          <span className="search-v2-org"><UserRound size={13} aria-hidden="true"/>{org.name}</span>
        </div>
      </div>
    </div>
  );
}
