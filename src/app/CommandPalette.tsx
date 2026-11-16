import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { screens } from "@/app/catalog";
import { APP_ENTRIES } from "@/app/nav";
import { routeForRecord } from "@/platform/attention";
import { canOpen } from "@/platform/policy";
import { useCollections, useOrgRecords, useWorkspace } from "@/platform/workspace";
import { useNavigationContinuity } from "@/platform/navigationContinuity";
import { destinationLabel } from "@/app/WorkspaceContinuity";

interface Hit {
  key: string;
  group: string;
  title: string;
  detail: string;
  to: string;
}

/**
 * Audit A07: every result is a real destination. Record hits resolve to the
 * route that opens them; results are keyboard navigable and scoped to the
 * organisation in the address bar.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { org, role } = useWorkspace();
  const records = useOrgRecords();
  const spaces = useCollections(["projects", "departments"]);
  const projects = spaces.projects ?? [];
  const departments = spaces.departments ?? [];
  const navigation = useNavigationContinuity(org.id, org.slug);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase();
    const pages: Hit[] = screens
      .filter((screen) => canOpen(role, screen.applicationCode))
      .filter((screen) => !q || `${screen.title} ${screen.applicationName} ${screen.purpose}`.toLowerCase().includes(q))
      .slice(0, q ? 8 : 6)
      .map((screen) => ({
        key: `page-${screen.id}`,
        group: "Screens",
        title: screen.title,
        detail: APP_ENTRIES[screen.applicationCode]?.short ?? screen.applicationName,
        to: screen.route.replace(":org", org.slug).replace(":id", screen.sampleId).replace(":slug", "showroom-consult"),
      }));

    const rows: Hit[] = q
      ? records
        .filter((record) => `${record.title} ${record.summary} ${record.status}`.toLowerCase().includes(q))
        .map((record) => ({ record, to: routeForRecord(record, org.slug) }))
        .filter((item): item is { record: typeof records[number]; to: string } => Boolean(item.to))
        .slice(0, 10)
        .map(({ record, to }) => ({
          key: `rec-${record.id}`,
          group: "Records",
          title: record.title,
          detail: `${record.collection} · ${record.status.replace(/_/g, " ")}`,
          to,
        }))
      : [];

    const locations: Hit[] = [...new Set([...navigation.pinned, ...navigation.recent.map(item => item.path)])]
      .filter(path => !q || destinationLabel(path, org.slug, projects, departments).toLowerCase().includes(q))
      .slice(0, q ? 8 : 6).map(path => ({
        key: `location-${path}`, group: "Recent & saved",
        title: destinationLabel(path, org.slug, projects, departments),
        detail: navigation.pinned.includes(path) ? "Saved location" : "Recently visited", to: path,
      }));
    const workspaces: Hit[] = q ? [
      ...departments.map(record => ({key: `department-${record.id}`, group: "Workspaces", title: record.title, detail: "Department space", to: `/o/${org.slug}/workspace/spaces/department/${record.id}`})),
      ...projects.map(record => ({key: `project-${record.id}`, group: "Workspaces", title: record.title, detail: "Project space", to: `/o/${org.slug}/workspace/work/project/${record.id}`})),
    ].filter(item => `${item.title} ${item.detail}`.toLowerCase().includes(q)).slice(0, 8) : [];
    const used = new Set<string>();
    return [...locations, ...workspaces, ...pages, ...rows].filter(hit => {
      if (used.has(hit.to)) return false;
      used.add(hit.to);
      return true;
    });
  }, [query, records, org.slug, role, navigation, departments, projects]);

  useEffect(() => { setIndex(0); }, [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index]);

  function go(hit: Hit | undefined) {
    if (!hit) return;
    navigate(hit.to);
    onClose();
  }

  let lastGroup = "";

  return (
    <div className="hq-palette-wrap" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="hq-palette" role="dialog" aria-modal="true" aria-label={`Search ${org.name}`}>
        <input
          className="hq-palette-input"
          autoFocus
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={hits[index]?.key}
          aria-label={`Search screens and records in ${org.name}`}
          placeholder={`Search screens and records in ${org.name}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); onClose(); }
            if (event.key === "ArrowDown") { event.preventDefault(); setIndex((value) => Math.min(value + 1, hits.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setIndex((value) => Math.max(value - 1, 0)); }
            if (event.key === "Enter") { event.preventDefault(); go(hits[index]); }
          }}
        />
        <div className="hq-palette-list" id="palette-list" role="listbox" aria-label="Results" ref={listRef}>
          {hits.length === 0 && (
            <p className="ds-subtle" style={{ padding: "var(--space-5)" }}>
              Nothing in {org.name} matches “{query}”. Records in another organisation are not searched from here.
            </p>
          )}
          {hits.map((hit, position) => {
            const header = hit.group !== lastGroup ? hit.group : null;
            lastGroup = hit.group;
            return (
              <div key={hit.key}>
                {header && <div className="ds-menu-label">{header}</div>}
                <button
                  type="button"
                  id={hit.key}
                  role="option"
                  aria-selected={position === index}
                  className="hq-palette-item"
                  onMouseEnter={() => setIndex(position)}
                  onClick={() => go(hit)}
                >
                  <span className="ds-truncate ds-grow" style={{ textAlign: "start" }}>{hit.title}</span>
                  <span className="k">{hit.detail}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="hq-palette-foot">
          <span><kbd className="ds-kbd">↑↓</kbd> move</span>
          <span><kbd className="ds-kbd">↵</kbd> open</span>
          <span><kbd className="ds-kbd">esc</kbd> close</span>
          <span className="ds-grow" />
          <span>Scoped to {org.name}</span>
        </div>
      </div>
    </div>
  );
}
