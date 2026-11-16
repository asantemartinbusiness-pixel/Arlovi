import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LayoutGrid, Search, X } from "lucide-react";
import { appEntry } from "@/app/catalog";
import { NAV_GROUPS, type AppNavEntry } from "@/app/nav";
import { canOpen } from "@/platform/policy";
import type { Role } from "@/domain/types";
import "./navigation.css";

interface Props {
  orgSlug: string;
  orgName: string;
  role: Role;
  initialGroup?: string;
  favourites: AppNavEntry[];
  onClose: () => void;
}

const ALL = "All applications";

/** Complete app discovery lives here, not in the primary sidebar or global toolbar. */
export function AppLauncher({ orgSlug, orgName, role, initialGroup, favourites, onClose }: Props) {
  const [category, setCategory] = useState(
    initialGroup && NAV_GROUPS.some((group) => group.label === initialGroup) ? initialGroup : ALL,
  );
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    searchRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((item) => item.getClientRects().length > 0);
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); origin.current?.focus(); };
  }, [onClose]);

  const groups = useMemo(() => NAV_GROUPS.map((group) => ({
    label: group.label,
    apps: group.apps.filter((app) => canOpen(role, app.code)),
  })).filter((group) => group.apps.length > 0), [role]);
  const total = groups.reduce((count, group) => count + group.apps.length, 0);
  const pinned = new Set(favourites.map((app) => app.code));
  const matches = groups.map((group) => ({
    ...group,
    apps: group.apps.filter((app) =>
      (category === ALL || category === group.label)
      && (!query.trim() || \`\${app.short} \${group.label}\`.toLowerCase().includes(query.trim().toLowerCase())),
    ),
  })).filter((group) => group.apps.length > 0);

  return (
    <div className="hq-launcher-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="hq-launcher" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="hq-launcher-title">
        <header className="hq-launcher-header">
          <div className="hq-launcher-intro">
            <span className="hq-launcher-eyebrow"><LayoutGrid size={13} /> ARLOVI APPLICATIONS</span>
            <h2 id="hq-launcher-title">Your complete workspace.</h2>
            <p>One company. {total} native applications available in your current role. Choose the tool for the work you need to do.</p>
          </div>
          <button type="button" className="hq-launcher-close" onClick={onClose} aria-label="Close applications">
            <X size={19} />
          </button>
        </header>
        <div className="hq-launcher-search-row">
          <label className="hq-launcher-search">
            <Search size={17} aria-hidden="true" />
            <input
              ref={searchRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              aria-label="Search applications" placeholder="Search apps, tools and workspaces…"
            />
          </label>
          <span className="hq-launcher-org ds-truncate" title={orgName}>{orgName}</span>
        </div>
        <div className="hq-launcher-content">
          <nav className="hq-launcher-filters" aria-label="Application categories">
            {[ALL, ...groups.map((group) => group.label)].map((label) => (
              <button
                type="button" key={label} aria-pressed={category === label}
                className="hq-launcher-filter" data-active={category === label ? "true" : undefined}
                onClick={() => setCategory(label)}
              >
                {label}
                <span>{label === ALL ? total : groups.find((group) => group.label === label)?.apps.length}</span>
              </button>
            ))}
          </nav>
          <div className="hq-launcher-results" aria-live="polite">
            {matches.length === 0 && (
              <div className="hq-launcher-empty">
                <Search size={22} strokeWidth={1.5} />
                <strong>No matching applications</strong>
                <p>Try another search term or view all applications.</p>
                <button type="button" onClick={() => { setQuery(""); setCategory(ALL); }}>Show all apps</button>
              </div>
            )}
            {matches.map((group) => (
              <section key={group.label} className="hq-launcher-group" aria-label={group.label}>
                <div className="hq-launcher-group-head">
                  <h3>{group.label}</h3>
                  <span>{group.apps.length} available</span>
                </div>
                <div className="hq-launcher-grid">
                  {group.apps.map((app) => {
                    const Icon = app.icon;
                    return (
                      <Link key={app.code} to={appEntry(app.code, orgSlug)} className="hq-launcher-app" onClick={onClose}>
                        <span className="hq-launcher-app-icon"><Icon size={21} strokeWidth={1.7} /></span>
                        <span className="hq-launcher-app-copy">
                          <strong>{app.short}</strong>
                          <small>{group.label} workspace</small>
                        </span>
                        {pinned.has(app.code) ? <span className="hq-launcher-pinned">Pinned</span> : <ArrowRight className="hq-launcher-arrow" size={16} />}
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
        <footer className="hq-launcher-footer">
          <span>All applications share your company workspace and navigation context.</span>
          <kbd>Esc</kbd> to close
        </footer>
      </div>
    </div>
  );
}
