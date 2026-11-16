import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowUpRight, Bookmark, BookmarkCheck, Clock3, Search, X } from "lucide-react";
import { applications, appEntry, findScreen } from "@/app/catalog";
import { NAV_GROUPS, type AppNavEntry } from "@/app/nav";
import { canOpen } from "@/platform/policy";
import { useCollection, useMutations, useWorkspace } from "@/platform/workspace";
import { useNavigationContinuity } from "@/platform/navigationContinuity";
import "./apps-directory.css";

export interface DirectoryApp extends AppNavEntry {
  group: string;
  name: string;
  purpose: string;
  entities: string;
}

const metadata = new Map(applications.map(app => [app.code, app]));
/** One canonical directory for every registered native application. */
export const DIRECTORY_APPS: DirectoryApp[] = NAV_GROUPS.flatMap(group =>
  group.apps.map(app => {
    const info = metadata.get(app.code);
    return {
      ...app, group: group.label,
      name: info?.name ?? app.short,
      purpose: info?.purpose ?? "Open this Arlovi application.",
      entities: info?.entities ?? "",
    };
  }),
);

function normalize(value: string): string {
  return value.toLocaleLowerCase().normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function findDirectoryApps(apps: DirectoryApp[], query: string, group = "All"): DirectoryApp[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  const matches = apps.filter(app => {
    if (group !== "All" && app.group !== group) return false;
    const haystack = normalize([app.short, app.name, app.group, app.purpose, app.entities].join(" "));
    return tokens.every(token => haystack.includes(token)
      || (token.length > 4 && token.endsWith("ies") && haystack.includes(token.slice(0, -3) + "y"))
      || (token.length > 4 && token.endsWith("s") && haystack.includes(token.slice(0, -1))));
  });
  if (!tokens.length) return matches;
  return [...matches].sort((a, b) => {
    const score = (app: DirectoryApp) => {
      const title = normalize(app.short);
      const name = normalize(app.name);
      const q = normalize(query);
      return (title === q ? 400 : title.startsWith(q) ? 250 : title.includes(q) ? 150 : 0)
        + (name.includes(q) ? 100 : 0);
    };
    return score(b) - score(a);
  });
}

function ApplicationCard({
  app, slug, pinned, busy, onPin,
}: {
  app: DirectoryApp;
  slug: string;
  pinned: boolean;
  busy: boolean;
  onPin: (app: DirectoryApp) => void;
}) {
  const Icon = app.icon;
  return <article className="apps-directory-card">
    <Link className="apps-directory-open" to={appEntry(app.code, slug)} aria-label={app.short}>
      <span className="apps-directory-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true" /></span>
      <span className="apps-directory-copy">
        <strong>{app.short}</strong>
        <span className="apps-directory-description">{app.purpose}</span>
      </span>
      <ArrowUpRight size={16} className="apps-directory-arrow" aria-hidden="true" />
    </Link>
    <button className="apps-directory-pin" type="button" aria-label={(pinned ? "Unpin " : "Pin ") + app.short}
      aria-pressed={pinned} title={pinned ? "Remove from favourites" : "Pin to favourites"}
      disabled={busy} onClick={() => onPin(app)}>
      {pinned ? <BookmarkCheck size={17} aria-hidden="true" /> : <Bookmark size={17} aria-hidden="true" />}
    </button>
  </article>;
}

function AppShortcut({ app, slug }: { app: DirectoryApp; slug: string }) {
  const Icon = app.icon;
  return <Link className="apps-directory-shortcut" to={appEntry(app.code, slug)}
    aria-label={app.short}>
    <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
    <span>{app.short}</span>
    <ArrowUpRight size={14} aria-hidden="true" />
  </Link>;
}

/**
 * Native tool directory, not a second dashboard. The catalog supplies product
 * descriptions and the existing navigation register supplies real entry routes.
 * No application code is loaded merely because its card is visible.
 */
export function AppsDirectory() {
  const { org, role } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const preferences = useCollection("preferences");
  const mutate = useMutations("workspace-apps");
  const navigation = useNavigationContinuity(org.id, org.slug);
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [error, setError] = useState("");
  const query = params.get("q") ?? "";
  const requestedGroup = params.get("category") ?? "All";
  const group = NAV_GROUPS.some(item => item.label === requestedGroup) ? requestedGroup : "All";

  const available = useMemo(() => DIRECTORY_APPS.filter(app => canOpen(role, app.code)), [role]);
  const visible = useMemo(() => findDirectoryApps(available, query, group), [available, query, group]);
  const favourites = useMemo(() => new Set(preferences
    .filter(pref => pref.fields.pinned === true)
    .map(pref => String(pref.fields.app))), [preferences]);
  const pinnedApps = available.filter(app => favourites.has(app.short));
  const recentApps = useMemo(() => {
    const used = new Set<string>();
    const result: DirectoryApp[] = [];
    for (const item of navigation.recent) {
      const matched = findScreen(item.path);
      if (!matched || matched.params.org !== org.slug) continue;
      const app = available.find(candidate => candidate.code === matched.screen.applicationCode);
      if (!app || used.has(app.code)) continue;
      used.add(app.code);
      result.push(app);
      if (result.length >= 5) break;
    }
    return result;
  }, [navigation.recent, org.slug, available]);

  function setFilter(key: "category" | "q", value: string) {
    const next = new URLSearchParams(params);
    if (value && !(key === "category" && value === "All")) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  async function togglePin(app: DirectoryApp) {
    if (busyCode) return;
    setBusyCode(app.code);
    setError("");
    try {
      const existing = preferences.find(pref => pref.fields.app === app.short);
      if (existing) {
        const result = await mutate.patch(existing.id, { fields: { pinned: !favourites.has(app.short) } },
          { event: app.short + (favourites.has(app.short) ? " removed from" : " added to") + " favourites" });
        if (!result) setError("The favourite changed in another tab. Review the latest state and retry.");
      } else {
        await mutate.create({
          collection: "preferences", title: "App preference: " + app.short,
          status: "active", fields: { app: app.short, pinned: true, mode: "native_local" },
          summary: "Application is pinned in local navigation.",
        }, app.short + " added to favourites");
      }
    } catch {
      setError("Could not change this favourite. Your existing preferences were not cleared.");
    } finally {
      setBusyCode(null);
    }
  }

  return <div className="apps-directory" aria-label="Native applications">
    <div className="apps-directory-toolbar">
      <label className="ws-app-search">
        <Search size={18} aria-hidden="true" />
        <span className="ds-sr-only">Find an application</span>
        <input type="text" aria-label="Find an application" value={query}
          onChange={event => setFilter("q", event.target.value)}
          placeholder="Search applications, teams or capabilities" />
        {query && <button className="apps-directory-clear" type="button" onClick={() => setFilter("q", "")}
          aria-label="Clear application search"><X size={16} aria-hidden="true"/></button>}
      </label>
      <span className="apps-directory-count" aria-live="polite">
        {visible.length} of {available.length} applications in this role view
      </span>
    </div>

    <nav className="apps-directory-categories" aria-label="Application categories">
      {["All", ...NAV_GROUPS.map(item => item.label)].map(category => {
        const count = category === "All" ? available.length
          : available.filter(app => app.group === category).length;
        if (!count && category !== "All") return null;
        return <button key={category} type="button" aria-pressed={group === category}
          onClick={() => setFilter("category", category)}>
          {category}<span aria-hidden="true">{count}</span>
        </button>;
      })}
    </nav>

    {!query && group === "All" && (pinnedApps.length > 0 || recentApps.length > 0) && (
      <div className="apps-directory-continuity">
        {pinnedApps.length > 0 && <section className="ws-section" aria-label="Pinned applications">
          <h2><Bookmark size={17} aria-hidden="true"/> Pinned</h2>
          <div className="apps-directory-shortcuts">
            {pinnedApps.map(app => <AppShortcut key={app.code} app={app} slug={org.slug}/>)}
          </div>
        </section>}
        {recentApps.length > 0 && <section className="ws-section" aria-label="Recently used applications">
          <h2><Clock3 size={17} aria-hidden="true"/> Recently used</h2>
          <div className="apps-directory-shortcuts">
            {recentApps.map(app => <AppShortcut key={app.code} app={app} slug={org.slug}/>)}
          </div>
        </section>}
      </div>
    )}

    {error && <p role="alert" className="apps-directory-error">{error}</p>}
    {visible.length === 0
      ? <section className="apps-directory-empty" aria-label="No applications found">
          <h2>No applications found</h2>
          <p>Try an application name, a capability such as invoices or documents, or another category.</p>
          <button type="button" onClick={() => {
            const next = new URLSearchParams(params);
            next.delete("q"); next.delete("category"); setParams(next, { replace: true });
          }}>Show all available applications</button>
        </section>
      : NAV_GROUPS.map(category => {
          const items = visible.filter(app => app.group === category.label);
          if (!items.length) return null;
          return <section className="ws-section apps-directory-group" key={category.label}
            aria-label={category.label + " applications"}>
            <div className="apps-directory-group-heading">
              <h2>{category.label}</h2><span>{items.length} {items.length === 1 ? "application" : "applications"}</span>
            </div>
            <div className="apps-directory-grid">
              {items.map(app => <ApplicationCard key={app.code} app={app} slug={org.slug}
                pinned={favourites.has(app.short)} busy={busyCode === app.code}
                onPin={item => void togglePin(item)}/>)}
            </div>
          </section>;
        })}
    <p className="apps-directory-footnote">
      Applications use {org.name}'s current browser-local workspace data.
      Role views organise the interface; they do not grant cloud account access.
    </p>
  </div>;
}
