import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowUpRight, Globe, LayoutGrid, List, Search, X,
} from "lucide-react";
import { Button, DataGrid, Empty, Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection } from "@/platform/workspace";
import { auditSite, issueCounts, liveState, readSite } from "./model";
import "./websites.css";

type SiteScope = "All" | "Draft" | "Published" | "Archived";
type LibraryView = "cards" | "table";
type LibrarySort = "recent" | "alphabetical";

/**
 * A native website library, not a mock dashboard. Every tile is built from
 * real local site records; links are scoped to the current organisation.
 */
export function SiteLibrary({ context, scope }: { context: ScreenContext; scope: SiteScope }) {
  const sites = useCollection("sites");
  const forms = useCollection("forms");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<LibraryView>("cards");
  const [sort, setSort] = useState<LibrarySort>("recent");
  const formNames = useMemo(() => Object.fromEntries(forms.map(form => [form.id, form.title])), [forms]);

  const active = sites.filter(record => record.status !== "archived");
  const hasExport = (record: (typeof sites)[number]) =>
    readSite(record).deployments.some(entry => entry.state === "exported");
  const exported = active.filter(hasExport).length;
  const verifiedDomains = active.filter(record => readSite(record).domains.some(domain => domain.verified)).length;
  const rows = useMemo(() => sites.filter(record => {
    const site = readSite(record);
    const localExport = site.deployments.some(entry => entry.state === "exported");
    if (scope === "Archived" && record.status !== "archived") return false;
    if (scope !== "Archived" && record.status === "archived") return false;
    if (scope === "Published" && !localExport) return false;
    if (scope === "Draft" && localExport) return false;
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return true;
    return [record.title, record.summary, record.ownerName, record.status,
      ...site.pages.map(page => page.name),
      ...site.domains.map(domain => domain.host)].join(" ").toLocaleLowerCase().includes(needle);
  }).sort((a, b) => sort === "recent"
    ? b.updatedAt.localeCompare(a.updatedAt)
    : a.title.localeCompare(b.title)), [sites, scope, search, sort]);

  const base = `/o/${context.org.slug}/web/sites`;
  return <div className="web-library">
    <section className="web-library-overview" data-compact aria-label="Website library overview">
      <div className="web-library-metrics" role="group" aria-label="Website summary">
        <div><span>Active sites</span><strong>{active.length}</strong></div>
        <div><span>Working drafts</span><strong>{active.length - exported}</strong></div>
        <div><span>Local exports</span><strong>{exported}</strong></div>
        <div><span>Verified domains</span><strong>{verifiedDomains}</strong></div>
      </div>
    </section>

    <div className="web-library-toolbar">
      <label className="web-library-search">
        <Search size={17} aria-hidden="true" />
        <span className="ds-sr-only">Find a website</span>
        <input type="search" aria-label="Find a website" value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Search sites, pages, owners or domains" />
        {search && <button type="button" aria-label="Clear website search" onClick={() => setSearch("")}>
          <X size={15} aria-hidden="true" />
        </button>}
      </label>
      <label className="web-library-sort">
        <span>Sort</span>
        <select aria-label="Sort websites" value={sort}
          onChange={event => setSort(event.target.value as LibrarySort)}>
          <option value="recent">Recently updated</option>
          <option value="alphabetical">Name A–Z</option>
        </select>
      </label>
      <div className="web-library-views" role="group" aria-label="Website display">
        <button type="button" aria-label="Card view" aria-pressed={view === "cards"}
          onClick={() => setView("cards")}><LayoutGrid size={16} aria-hidden="true" /></button>
        <button type="button" aria-label="Table view" aria-pressed={view === "table"}
          onClick={() => setView("table")}><List size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="web-library-resultline" role="status">
      <strong>{rows.length}</strong> {rows.length === 1 ? "website" : "websites"} in {scope.toLowerCase()}
      {search && <> matching “{search}”</>}
    </div>

    {rows.length === 0 ? <Empty
      title={search ? "No websites match your search" : scope === "All" ? "No websites yet" : `No ${scope.toLowerCase()} websites`}
      icon={<Globe size={20} />}
      action={<Button variant="secondary" onClick={() => search ? setSearch("") : context.openOverlay("Site setup")}>
        {search ? "Clear search" : "Create a website"}
      </Button>}>
      {search ? "Try a website name, page, owner or domain." :
        "Create a site to edit pages and content. Hosting and live analytics require external services."}
    </Empty> : view === "cards" ? (
      <div className="web-library-grid" aria-label="Website cards">
        {rows.map(record => {
          const site = readSite(record);
          const state = liveState(record, site);
          const domain = site.domains.find(item => item.primary) ?? site.domains[0];
          const counts = issueCounts(auditSite(site, formNames));
          const url = `${base}/${record.id}`;
          return <article className="web-library-card" key={record.id}>
            <div className="web-library-card-top">
              <span className="web-library-site-icon"><Globe size={20} strokeWidth={1.7} aria-hidden="true" /></span>
              <Pill tone={state.tone === "neutral" ? "neutral" : state.tone} dot>{state.label}</Pill>
            </div>
            <div className="web-library-card-copy">
              <h3><Link to={url}>{record.title}</Link></h3>
              <ul className="web-library-routes" aria-label={`Routes of ${record.title}`}>
                {site.pages.slice(0, 4).map(page => <li key={page.id}>{page.path}</li>)}
                {site.pages.length > 4 && <li className="web-library-routes-more">+{site.pages.length - 4}</li>}
              </ul>
              <span className="web-library-domain">{domain
                ? `${domain.host}${domain.verified ? "" : " · unverified"}`
                : "No domain connected"}</span>
            </div>
            <dl className="web-library-card-stats">
              <div><dt>Pages</dt><dd>{site.pages.length}</dd></div>
              <div><dt>Blocks</dt><dd>{site.pages.reduce((n, page) => n + page.blocks.length, 0)}</dd></div>
              <div><dt>Quality</dt><dd className={counts.fail > 0 ? "web-library-attention" : undefined}>
                {counts.fail > 0 ? `${counts.fail} failing` : counts.warn > 0 ? `${counts.warn} review` : "Clear"}
              </dd></div>
            </dl>
            <div className="web-library-card-foot">
              <span className="web-library-updated">Updated {context.relative(record.updatedAt)}</span>
              <div>
                <Link to={url}>Dashboard <ArrowUpRight size={14} aria-hidden="true" /></Link>
                <Link to={`${url}/builder`}>Editor</Link>
              </div>
            </div>
          </article>;
        })}
      </div>
    ) : (
      <DataGrid rows={rows} rowId={row => row.id} label="Sites" columns={[
        { key: "title", header: "Site", primary: true, cell: row => row.title,
          sortValue: row => row.title, filterValue: row => `${row.title} ${row.summary}` },
        { key: "pages", header: "Pages", align: "end", cell: row => String(readSite(row).pages.length) },
        { key: "domain", header: "Domain", cell: row => {
          const site = readSite(row);
          const domain = site.domains.find(item => item.primary) ?? site.domains[0];
          return domain ? `${domain.host}${domain.verified ? "" : " · unverified"}` : "Not attached";
        } },
        { key: "quality", header: "Quality", cell: row => {
          const counts = issueCounts(auditSite(readSite(row), formNames));
          return counts.fail ? <Pill tone="danger">{counts.fail} failing</Pill>
            : counts.warn ? <Pill tone="warning">{counts.warn} to review</Pill>
              : <Pill tone="success">Clear</Pill>;
        } },
        { key: "publication", header: "Publication", cell: row => {
          const state = liveState(row, readSite(row));
          return <Pill tone={state.tone === "neutral" ? "neutral" : state.tone}>{state.label}</Pill>;
        } },
        { key: "updated", header: "Updated", cell: row => context.relative(row.updatedAt), sortValue: row => row.updatedAt },
      ]} onOpen={id => context.navigate(`${base}/${id}`)}
        onSelect={id => context.select(id)} selectedId={context.selectedId}
        summary={<span>Publication is verified only when supported by real hosting evidence. Site exports remain local.</span>}
      />
    )}
    <p className="web-library-boundary">Sites and exports live in this browser. Hosting, DNS and traffic analytics are not connected.</p>
  </div>;
}
