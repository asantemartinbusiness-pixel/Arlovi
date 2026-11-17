import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Megaphone, RotateCcw, Search } from "lucide-react";
import { Button, DataGrid, Empty, Notice, Pill, Segmented, Select, TextInput } from "@/design-system";
import type { Rec } from "@/domain/types";
import type { ScreenContext } from "@/platform/registry";
import { useWorkspace } from "@/platform/workspace";
import { bodyOf, networkOf, useMarketData, type CampaignBody } from "./data";
import {
  campaignChannels, campaignLibraryRows, campaignPortfolioStats, campaignStageRows,
  type CampaignLibrarySort,
} from "./campaignLibraryModel";
import "./campaign-library.css";

type ViewMode = "list" | "cards";

const statusTone = (status: string): "success" | "warning" | "neutral" | "info" =>
  status === "active" || status === "approved" ? "success"
    : status === "approval" ? "warning"
      : status === "completed" || status === "archived" ? "neutral" : "info";

const statusLabel = (status: string) =>
  status === "approval" ? "Awaiting approval" : status.replaceAll("_", " ");

export function CampaignLibraryWorkspace({ context, state }: { context: ScreenContext; state: string }) {
  const { org } = useWorkspace();
  const data = useMarketData();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [sort, setSort] = useState<CampaignLibrarySort>("recent");
  const [view, setView] = useState<ViewMode>("list");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const stats = useMemo(() => campaignPortfolioStats(data.campaigns), [data.campaigns]);
  const stage = useMemo(() => campaignStageRows(data.campaigns, state), [data.campaigns, state]);
  const channels = useMemo(() => [...new Set(data.campaigns.flatMap(campaignChannels))].sort(), [data.campaigns]);
  const rows = useMemo(() => campaignLibraryRows(data.campaigns, { state, query: search, channel, sort }),
    [data.campaigns, state, search, channel, sort]);
  const filtered = Boolean(search.trim() || channel !== "all");
  const canCreate = context.can("publish_campaign");

  // A selected row from a previous status tab must not be used as an action
  // target in another tab.
  useEffect(() => {
    context.select(undefined);
  }, [state, context.select]);

  function resetFilters() {
    setSearch("");
    setChannel("all");
    setSort("recent");
    context.select(undefined);
  }

  async function duplicateCampaigns(selected: Rec[]) {
    if (busy || !selected.length) return;
    setBusy(true);
    setActionError("");
    try {
      for (const campaign of selected) {
        const body = bodyOf<CampaignBody>(campaign, {});
        await context.mutate.create({
          collection: "campaigns",
          title: `${campaign.title} (copy)`,
          status: "draft",
          summary: campaign.summary,
          amountMinor: Number(campaign.fields.budgetMinor ?? 0),
          fields: {
            ...campaign.fields, spentMinor: 0, approval: "draft",
            delivery: "not_connected",
          },
          body: {
            ...body,
            channels: (body.channels ?? []).map(item => ({
              ...item, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0,
            })),
          },
        }, `Campaign ${campaign.title} duplicated as a draft`);
      }
      context.toast("Drafts created", `${selected.length} campaign${selected.length === 1 ? "" : "s"} duplicated with results and spend reset. No provider was contacted.`);
    } catch {
      setActionError("The duplication did not finish. Some drafts may already exist; review the library before retrying.");
    } finally {
      setBusy(false);
    }
  }

  async function archiveCampaigns(selected: Rec[]) {
    if (busy || !selected.length || selected.some(row => row.status === "active")) return;
    setBusy(true);
    setActionError("");
    try {
      for (const campaign of selected) {
        const result = await context.mutate.patch(campaign.id, { status: "archived" },
          { expectRevision: campaign.revision, event: `Campaign ${campaign.title} archived` });
        if (!result) throw new Error("Revision conflict");
      }
      context.toast("Campaigns archived", `${selected.length} campaign${selected.length === 1 ? "" : "s"} archived in this workspace.`);
    } catch {
      setActionError("Archiving did not finish. Some records may have changed. Review the current statuses before retrying.");
    } finally {
      setBusy(false);
    }
  }

  const shownCount = `${rows.length} of ${stage.length} ${stage.length === 1 ? "campaign" : "campaigns"} in ${state.toLowerCase()}`;

  return <section className="t4-campaign-library" aria-label="Campaign portfolio">
    <div className="t4-campaign-summary">
      <div className="t4-campaign-summary-copy">
        <span className="t4-campaign-eyebrow">MARKETING / CAMPAIGN PORTFOLIO</span>
        <h2>Every campaign, one place</h2>
        <p>Review plans, owners, budgets and delivery readiness without leaving the library.</p>
      </div>
      <div className="t4-campaign-metrics" aria-label="Campaign portfolio figures">
        <div><strong>{stats.total}</strong><span>Total campaigns</span></div>
        <div><strong>{stats.active}</strong><span>Active</span></div>
        <div><strong>{stats.awaiting}</strong><span>Awaiting approval</span></div>
        <div><strong>{context.money(stats.budgetMinor)}</strong><span>Planned budget</span></div>
        <div><strong>{context.money(stats.spentMinor)}</strong><span>Spend recorded</span></div>
      </div>
    </div>

    <div className="t4-campaign-context" aria-label="Marketing workflow">
      <span>Plan and review</span>
      <Link to={`/o/${org.slug}/market/calendar`}><CalendarDays size={15} aria-hidden="true" /> Content calendar <ArrowUpRight size={14} aria-hidden="true" /></Link>
      <Link to={`/o/${org.slug}/market/analytics`}>Attribution <ArrowUpRight size={14} aria-hidden="true" /></Link>
      {stats.awaiting > 0 && <Link to={`/o/${org.slug}/market/campaigns?tab=Approval`} className="t4-campaign-review">
        {stats.awaiting} awaiting a decision <ArrowUpRight size={14} aria-hidden="true" />
      </Link>}
    </div>

    <div className="t4-campaign-filters" role="group" aria-label="Find and organise campaigns">
      <label className="t4-campaign-search">
        <span>Search campaigns</span>
        <span className="t4-campaign-search-field"><Search size={17} aria-hidden="true" />
          <TextInput type="search" aria-label="Search campaigns" placeholder="Name, objective, owner or channel"
            value={search} onChange={event => { setSearch(event.target.value); context.select(undefined); }} />
        </span>
      </label>
      <label><span>Channel</span>
        <Select aria-label="Filter by channel" value={channel} onChange={event => { setChannel(event.target.value); context.select(undefined); }}>
          <option value="all">All channels</option>
          {channels.map(item => <option key={item} value={item}>{networkOf(item).label}</option>)}
        </Select>
      </label>
      <label><span>Sort by</span>
        <Select aria-label="Sort campaigns" value={sort} onChange={event => setSort(event.target.value as CampaignLibrarySort)}>
          <option value="recent">Recently updated</option>
          <option value="name">Campaign name</option>
          <option value="budget">Highest budget</option>
          <option value="start">Start date</option>
        </Select>
      </label>
      <div className="t4-campaign-layout">
        <span>View</span>
        <Segmented label="Campaign layout" value={view} onChange={value => setView(value as ViewMode)}
          options={[{ value: "list", label: "List" }, { value: "cards", label: "Cards" }]} />
      </div>
      {filtered && <Button size="sm" variant="ghost" onClick={resetFilters}>
        <RotateCcw size={15} aria-hidden="true" /> Clear filters
      </Button>}
    </div>

    <div className="t4-campaign-resultline">
      <span role="status" aria-live="polite">{shownCount}</span>
      <span>{state === "Approval" ? "Review decisions are recorded locally." : "Select a record to inspect or manage it."}</span>
    </div>
    {actionError && <Notice tone="danger" title="Campaign action needs review">{actionError}</Notice>}

    {rows.length === 0
      ? <div className="t4-campaign-empty">
        <Empty title={filtered ? "No campaigns match these filters" : `No ${state.toLowerCase()} campaigns`}
          icon={<Megaphone size={20} />}
          action={filtered
            ? <Button variant="secondary" onClick={resetFilters}>Clear search and channel</Button>
            : canCreate
              ? <Button variant="primary" onClick={() => context.openOverlay("campaign wizard")}>Create a draft campaign</Button>
              : undefined}>
          {filtered
            ? "Try another name or channel. Your campaign records have not changed."
            : "Campaign plans, budgets and channel performance will appear here when recorded."}
        </Empty>
      </div>
      : view === "cards"
        ? <div className="t4-campaign-cards" role="list" aria-label={`${state} campaign cards`}>
          {rows.map(campaign => {
            const campaignNetworks = campaignChannels(campaign);
            const selected = context.selectedId === campaign.id;
            return <article key={campaign.id} role="listitem" className="t4-campaign-card" data-selected={selected || undefined}>
              <div className="t4-campaign-card-top">
                <span className="t4-campaign-card-category">{String(campaign.fields.objective ?? "Campaign")}</span>
                <Pill tone={statusTone(campaign.status)} dot>{statusLabel(campaign.status)}</Pill>
              </div>
              <h3><Link to={`/o/${org.slug}/market/campaigns/${campaign.id}`}>{campaign.title}</Link></h3>
              <p className="t4-campaign-card-summary">{campaign.summary}</p>
              <div className="t4-campaign-card-channels">
                {campaignNetworks.length ? campaignNetworks.map(item => <Pill key={item}>{networkOf(item).label}</Pill>) : <span>No channels planned</span>}
              </div>
              <dl className="t4-campaign-card-facts">
                <div><dt>Owner</dt><dd>{campaign.ownerName || "Not assigned"}</dd></div>
                <div><dt>Budget</dt><dd>{context.money(Number(campaign.fields.budgetMinor ?? campaign.amountMinor ?? 0))}</dd></div>
                <div><dt>Committed</dt><dd>{context.money(Number(campaign.fields.spentMinor ?? 0))}</dd></div>
                <div><dt>Start</dt><dd>{campaign.startAt ? context.date(campaign.startAt) : "Not scheduled"}</dd></div>
              </dl>
              <div className="t4-campaign-card-actions">
                <Button size="sm" variant={selected ? "primary" : "secondary"} aria-pressed={selected}
                  onClick={() => context.select(selected ? undefined : campaign.id)}>
                  {selected ? "Selected" : "Select"}
                </Button>
                <Link to={`/o/${org.slug}/market/campaigns/${campaign.id}`}>
                  Open campaign <ArrowUpRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </article>;
          })}
        </div>
        : <DataGrid
          key={`${state}:${search}:${channel}:${sort}`}
          rows={rows}
          label={`${state} campaign portfolio`}
          rowId={campaign => campaign.id}
          selectedId={context.selectedId}
          onSelect={id => context.select(id)}
          onOpen={id => context.navigate(`/o/${org.slug}/market/campaigns/${id}`)}
          filterable={false}
          rowTone={campaign => campaign.status === "approval" ? "warning" : undefined}
          columns={[
            { key: "title", header: "Campaign", primary: true, cell: row => <span className="t4-campaign-name">{row.title}</span>, sortValue: row => row.title, filterValue: row => row.title },
            { key: "objective", header: "Objective", cell: row => String(row.fields.objective ?? "—") },
            { key: "owner", header: "Owner", cell: row => row.ownerName || "Unassigned", hideBelow: 900 },
            { key: "channels", header: "Channels", cell: row => <span className="t4-campaign-row-channels">
              {campaignChannels(row).map(item => <Pill key={item}>{networkOf(item).label}</Pill>)}
            </span>, hideBelow: 1100 },
            { key: "budget", header: "Budget", align: "end", cell: row => context.money(Number(row.fields.budgetMinor ?? row.amountMinor ?? 0)), sortValue: row => Number(row.fields.budgetMinor ?? row.amountMinor ?? 0) },
            { key: "spent", header: "Committed", align: "end", cell: row => context.money(Number(row.fields.spentMinor ?? 0)), hideBelow: 1000 },
            { key: "status", header: "Status", cell: row => <Pill tone={statusTone(row.status)} dot>{statusLabel(row.status)}</Pill> },
            { key: "delivery", header: "Delivery", cell: row => <Pill tone={row.fields.delivery === "not_connected" ? "warning" : "neutral"}>
              {row.fields.delivery === "not_connected" || !row.fields.delivery ? "Not connected" : String(row.fields.delivery)}
            </Pill>, hideBelow: 1200 },
          ]}
          card={row => <div className="t4-campaign-mobile-row">
            <strong>{row.title}</strong><Pill tone={statusTone(row.status)}>{statusLabel(row.status)}</Pill>
            <span>{String(row.fields.objective ?? "Campaign")} · {context.money(Number(row.fields.budgetMinor ?? row.amountMinor ?? 0))}</span>
          </div>}
          bulkActions={[
            { label: "Duplicate as draft", onRun: selected => { void duplicateCampaigns(selected); }, disabled: () => busy },
            { label: "Archive", tone: "danger", disabled: selected => busy || selected.some(row => row.status === "active"), onRun: selected => { void archiveCampaigns(selected); } },
          ]}
          summary={<span>{rows.length} results · {context.money(rows.reduce((sum, row) => sum + Number(row.fields.budgetMinor ?? row.amountMinor ?? 0), 0))} planned</span>}
        />}

    <p className="t4-campaign-footnote">Budgets and performance reflect this organisation's saved campaign records. Ad platforms, email delivery and external spending are not connected by this library.</p>
  </section>;
}
