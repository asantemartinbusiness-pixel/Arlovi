import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart, Button, Card, DataGrid, DonutChart, Empty, Field, Grid, Meter, Notice,
  Pill, Properties, Row, Segmented, Select, Stack, Stat, StatRow,
} from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useCollection, useRecord, useWorkspace } from "@/platform/workspace";
import { freshness } from "@/platform/clock";
import { CalendarToolbar, ProviderBoundary, ScheduleCalendar } from "@/applications/market/kit";
import { CalendarCheck, Mail, Megaphone, PenLine, Search, Users } from "lucide-react";
import type { Rec } from "@/domain/types";
import {
  bodyOf, evaluateSegment, networkOf, rollUp, useMarketData,
  type AudienceBody, type CampaignBody, type ChannelPlan, type PostBody, type SiteBody,
} from "./data";
import { attributionFilter, PageChecksCard, useAttributionFilter } from "./actions";
import { CampaignLibraryWorkspace } from "./CampaignLibraryWorkspace";
import { AudienceSegmentsLibrary } from "./AudienceSegmentsLibrary";

/* ====================================================================== *
 * MARKET panels. Each tab in the approved contract renders its own panel.
 * ====================================================================== */

const toneForStatus = (status: string) =>
  status === "active" || status === "approved" ? "success" : status === "approval" ? "warning" : status === "completed" ? "neutral" : "info";

function channelTotals(channels: ChannelPlan[]) {
  return channels.reduce(
    (sum, channel) => ({
      budgetMinor: sum.budgetMinor + channel.budgetMinor,
      spentMinor: sum.spentMinor + channel.spentMinor,
      impressions: sum.impressions + channel.impressions,
      clicks: sum.clicks + channel.clicks,
      conversions: sum.conversions + channel.conversions,
      revenueMinor: sum.revenueMinor + channel.revenueMinor,
    }),
    { budgetMinor: 0, spentMinor: 0, impressions: 0, clicks: 0, conversions: 0, revenueMinor: 0 },
  );
}

/* ---------------------------- MARKET-001 ---------------------------- */

export function MarketingOverview({ context, lens }: { context: ScreenContext; lens: "Overview" | "Performance" | "Calendar" | "Opportunities" }) {
  const data = useMarketData();
  const { now, org } = useWorkspace();
  const [anchor, setAnchor] = useState(() => new Date(now));
  const [mode, setMode] = useState<"month" | "week">("month");

  const live = data.campaigns.filter((campaign) => campaign.status === "active");
  const channels = rollUp(data.campaigns);
  const totals = channelTotals(channels);
  const unattributedOrders = data.orders.filter((order) => !order.tags.includes("trade") && !order.tags.includes("storefront")).length;
  const attributedConversions = totals.conversions;
  const orderCount = data.orders.filter((order) => order.status !== "cancelled").length;
  const attributionGap = Math.max(0, orderCount - attributedConversions);

  if (lens === "Calendar") {
    const items = data.campaigns
      .filter((campaign) => campaign.startAt)
      .map((campaign) => ({
        id: campaign.id,
        title: campaign.title,
        at: campaign.startAt!,
        tone: toneForStatus(campaign.status) as "success" | "warning" | "neutral" | "info",
        meta: `${context.money(Number(campaign.fields.budgetMinor ?? 0))} · ${String(campaign.fields.primaryChannel ?? "")}`,
        locked: campaign.status === "completed" ? "a completed campaign keeps its recorded dates" : undefined,
      }));
    return (
      <Stack gap={4}>
        <CalendarToolbar mode={mode} onMode={setMode} anchor={anchor} onAnchor={setAnchor} now={now} label="Campaign calendar" />
        <ScheduleCalendar
          mode={mode}
          anchor={anchor}
          now={now}
          items={items}
          label="Campaign start dates"
          onOpen={(id) => context.navigate(`/o/${org.slug}/market/campaigns/${id}`)}
          onMove={async (id, nextIso) => {
            const campaign = data.campaigns.find((item) => item.id === id);
            if (!campaign) return;
            const length = campaign.endAt && campaign.startAt
              ? new Date(campaign.endAt).getTime() - new Date(campaign.startAt).getTime()
              : 14 * 86_400_000;
            await context.mutate.patch(
              id,
              { startAt: nextIso, endAt: new Date(new Date(nextIso).getTime() + length).toISOString(), at: nextIso },
              { expectRevision: campaign.revision, event: `Campaign ${campaign.title} rescheduled` },
            );
            context.toast("Campaign moved", `${campaign.title} now starts ${context.date(nextIso)}. The window length was kept.`);
          }}
        />
        <Notice tone="info" title="Moving a campaign changes the plan, not a provider schedule">
          Start and end dates are records in this workspace. No advertising or mail provider is connected, so nothing is rescheduled outside this browser.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Performance") {
    return (
      <Grid>
        <Card span={8} title="Revenue recorded against each channel" subtitle="From the channel figures held on each campaign record">
          <BarChart
            title="Revenue and spend by channel"
            height={240}
            format={(value) => context.money(value)}
            series={[
              { name: "Revenue", points: channels.map((channel) => ({ label: networkOf(channel.network).label, value: channel.revenueMinor })) },
              { name: "Spend", points: channels.map((channel) => ({ label: networkOf(channel.network).label, value: channel.spentMinor })) },
            ]}
            footer="Revenue is the value of orders the campaign record claims it influenced. It is not a measured causal effect."
          />
        </Card>
        <Card span={4} title="Spend share" subtitle={context.money(totals.spentMinor)}>
          <DonutChart
            title="Spend by channel"
            format={(value) => context.money(value)}
            points={channels.filter((channel) => channel.spentMinor > 0).map((channel) => ({ label: networkOf(channel.network).label, value: channel.spentMinor }))}
          />
        </Card>
        <Card span={12} title="Channel table" subtitle="Every figure below is a stored field, not a model output" flush>
          <DataGrid
            rows={channels}
            rowId={(row) => row.network}
            label="Channel performance"
            filterable={false}
            columns={[
              { key: "network", header: "Channel", primary: true, cell: (row) => networkOf(row.network).label },
              { key: "budget", header: "Budget", align: "end", cell: (row) => context.money(row.budgetMinor), sortValue: (row) => row.budgetMinor },
              { key: "spend", header: "Spend", align: "end", cell: (row) => context.money(row.spentMinor), sortValue: (row) => row.spentMinor },
              { key: "clicks", header: "Clicks", align: "end", cell: (row) => row.clicks.toLocaleString(org.locale), sortValue: (row) => row.clicks },
              { key: "conv", header: "Conversions", align: "end", cell: (row) => String(row.conversions), sortValue: (row) => row.conversions },
              { key: "cpa", header: "Cost per conversion", align: "end", cell: (row) => (row.conversions === 0 ? <span className="ds-subtle">No conversions recorded</span> : context.money(Math.round(row.spentMinor / row.conversions))) },
              { key: "revenue", header: "Revenue", align: "end", cell: (row) => context.money(row.revenueMinor), sortValue: (row) => row.revenueMinor },
            ]}
            summary={<span>Spend {context.money(totals.spentMinor)} · revenue {context.money(totals.revenueMinor)}</span>}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Opportunities") {
    const opportunities: { id: string; title: string; body: string; to?: string }[] = [];
    for (const campaign of data.campaigns) {
      const body = bodyOf<CampaignBody>(campaign, {});
      const campaignTotals = channelTotals(body.channels ?? []);
      if (campaignTotals.budgetMinor > 0 && campaignTotals.spentMinor / campaignTotals.budgetMinor > 0.85 && campaign.status === "active") {
        opportunities.push({ id: `${campaign.id}-budget`, title: `${campaign.title} has used ${Math.round((campaignTotals.spentMinor / campaignTotals.budgetMinor) * 100)}% of its budget`, body: "Review the allocation before the window closes. Spend figures are local records, not a provider balance.", to: `/o/${org.slug}/market/campaigns/${campaign.id}` });
      }
      if (campaign.status === "approval") {
        opportunities.push({ id: `${campaign.id}-approval`, title: `${campaign.title} is waiting for approval`, body: `Raised by ${campaign.ownerName}. Nothing starts until a plan approval is recorded.`, to: `/o/${org.slug}/market/campaigns/${campaign.id}` });
      }
    }
    const failed = data.socialPosts.filter((post) => post.status === "failed");
    if (failed.length) opportunities.push({ id: "failed", title: `${failed.length} scheduled post${failed.length === 1 ? "" : "s"} did not go out`, body: "No social account is connected, so the scheduled time passed with the post unsent.", to: `/o/${org.slug}/market/social` });
    const audiencesWithoutConsent = data.audiences.filter((audience) => !(bodyOf<AudienceBody>(audience, {}).exclusions ?? []).includes("suppressed"));
    if (audiencesWithoutConsent.length) opportunities.push({ id: "consent", title: `${audiencesWithoutConsent.length} segment${audiencesWithoutConsent.length === 1 ? "" : "s"} do not exclude suppressed contacts`, body: "Add the suppression exclusion before any send is approved.", to: `/o/${org.slug}/market/audiences` });

    return opportunities.length === 0
      ? <Empty title="Nothing stands out" icon={<Megaphone size={20} />}>Opportunities are derived from campaign, post and audience records in this workspace. Nothing is invented.</Empty>
      : (
        <Stack gap={3}>
          {opportunities.map((item) => (
            <Card key={item.id} title={item.title} subtitle={item.body} actions={item.to ? <Button size="sm" variant="secondary" onClick={() => context.navigate(item.to!)}>Open</Button> : undefined} />
          ))}
        </Stack>
      );
  }

  const upcoming = data.socialPosts
    .filter((post) => post.startAt && new Date(post.startAt) >= now)
    .sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));

  return (
    <Stack gap={5}>
      <StatRow>
        <Stat label="Live campaigns" value={String(live.length)} meta={`${data.campaigns.length} in the library`} onClick={() => context.openOverlay("Metric source", { metric: "live" })} />
        <Stat label="Committed spend" value={context.money(totals.spentMinor)} meta={`of ${context.money(totals.budgetMinor)} planned`} onClick={() => context.openOverlay("budget inspector")} />
        <Stat label="Attributed revenue" value={context.money(totals.revenueMinor)} meta={`${totals.conversions} recorded conversions`} onClick={() => context.openOverlay("Metric source", { metric: "revenue" })} />
        <Stat label="Leads this period" value={String(data.leads.length)} meta="From lead records in this workspace" onClick={() => context.openOverlay("Metric source", { metric: "leads" })} />
        <Stat label="Ad platform spend" value="Unavailable" unavailable meta="No ad account is connected" onClick={() => context.openOverlay("Metric source", { metric: "provider" })} />
      </StatRow>

      <Notice tone="warning" title={`${attributionGap} order${attributionGap === 1 ? "" : "s"} cannot be attributed to a campaign`}>
        {orderCount} orders are recorded and campaigns claim {attributedConversions} conversions between them. The difference is shown as unattributed rather than assigned to a channel.
        {unattributedOrders > 0 && ` ${unattributedOrders} order${unattributedOrders === 1 ? " carries" : "s carry"} no channel tag at all.`}
      </Notice>

      <Grid>
        <Card span={7} title="Live campaigns" subtitle={`${live.length} running against ${context.money(totals.budgetMinor)} of planned budget`}>
          {live.length === 0 ? (
            <Empty title="Nothing is live" icon={<Megaphone size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("campaign wizard")}>Create campaign</Button>}>
              A campaign becomes live when a launch approval is recorded against it.
            </Empty>
          ) : (
            <Stack gap={4}>
              {live.map((campaign) => {
                const body = bodyOf<CampaignBody>(campaign, {});
                const campaignTotals = channelTotals(body.channels ?? []);
                return (
                  <div key={campaign.id}>
                    <Row gap={2} wrap>
                      <Link to={`/o/${org.slug}/market/campaigns/${campaign.id}`} className="ds-grow" style={{ fontWeight: 600, color: "inherit", textDecoration: "none" }}>{campaign.title}</Link>
                      <Pill tone="info">{String(campaign.fields.objective ?? "")}</Pill>
                      <span className="ds-subtle">{context.date(campaign.startAt)} – {context.date(campaign.endAt)}</span>
                    </Row>
                    <Meter value={campaignTotals.spentMinor} max={campaignTotals.budgetMinor || 1} label={`${campaign.title} budget`} tone={campaignTotals.spentMinor > campaignTotals.budgetMinor * 0.85 ? "warning" : undefined} />
                    <span className="ds-subtle">{context.money(campaignTotals.spentMinor)} of {context.money(campaignTotals.budgetMinor)} committed locally · {campaignTotals.conversions} conversions recorded</span>
                  </div>
                );
              })}
            </Stack>
          )}
        </Card>

        <Card span={5} title="Next out of the door" subtitle={`${upcoming.length} scheduled items`}>
          {upcoming.length === 0 ? (
            <Empty title="Nothing is scheduled" icon={<CalendarCheck size={20} />}>Schedule a post from the content calendar.</Empty>
          ) : (
            <Stack gap={2}>
              {upcoming.slice(0, 6).map((post) => (
                <Row key={post.id} gap={2} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                  <div className="ds-grow">
                    <strong>{post.title}</strong>
                    <p className="ds-subtle">{networkOf(String(post.fields.network)).label} · {context.dateTime(post.startAt)}</p>
                  </div>
                  <Pill tone="warning" dot>Queued locally</Pill>
                </Row>
              ))}
            </Stack>
          )}
        </Card>

        <Card span={12} title="Leads recorded by source" subtitle="Counted from lead records, never estimated">
          <BarChart
            title="Leads by source"
            height={180}
            format={(value) => String(Math.round(value))}
            series={[{
              name: "Leads",
              points: [...new Set(data.leads.map((lead) => String(lead.fields.source ?? "unknown")))].map((source) => ({
                label: source,
                value: data.leads.filter((lead) => String(lead.fields.source ?? "unknown") === source).length,
              })),
            }]}
          />
        </Card>
      </Grid>
    </Stack>
  );
}

/* ---------------------------- MARKET-002 ---------------------------- */

export function CampaignLibrary({ context, state }: { context: ScreenContext; state: string }) {
  return <CampaignLibraryWorkspace context={context} state={state} />;
}

/* ---------------------------- MARKET-003 ---------------------------- */

export function CampaignDetail({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const { org, now } = useWorkspace();
  const campaign = useRecord(context.params.id) ?? data.campaigns.find((item) => item.id === context.params.id);
  const body = bodyOf<CampaignBody>(campaign, {});
  const channels = body.channels ?? [];
  const totals = channelTotals(channels);
  const audience = data.audiences.find((item) => item.id === String(campaign?.fields.audienceId ?? ""));
  const segment = evaluateSegment(audience, data.contacts, now);
  const posts = data.socialPosts.filter((post) => String(post.fields.campaignId ?? "") === campaign?.id);

  if (!campaign) return <Empty title="Campaign not found" />;

  if (lens === "Plan") {
    return (
      <Grid>
        <Card span={7} title="Brief" subtitle={`Objective: ${String(campaign.fields.objective ?? "not set")}`}>
          <p className="ds-prose">{body.brief ?? campaign.summary}</p>
        </Card>
        <Card span={5} title="Audience" subtitle={audience ? audience.title : "No audience linked"}>
          {audience ? (
            <Stack gap={3}>
              <Properties rows={[
                { label: "Members now", value: <strong>{segment.members.length}</strong> },
                { label: "Held back", value: `${segment.excluded.length} excluded` },
                { label: "Counted", value: context.relative(String(audience.fields.lastCountedAt ?? audience.updatedAt)) },
              ]} />
              <Button size="sm" variant="secondary" onClick={() => context.navigate(`/o/${org.slug}/market/audiences`)}>Open the segment</Button>
            </Stack>
          ) : <Empty title="No audience" >Link a segment so the plan has a recipient count.</Empty>}
        </Card>
        <Card span={12} title="Channel plan" subtitle="Budget is split per channel and committed locally" flush>
          <DataGrid
            rows={channels}
            rowId={(row) => row.network}
            label="Channel plan"
            filterable={false}
            columns={[
              { key: "network", header: "Channel", primary: true, cell: (row) => networkOf(row.network).label },
              { key: "budget", header: "Budget", align: "end", cell: (row) => context.money(row.budgetMinor), sortValue: (row) => row.budgetMinor },
              { key: "share", header: "Share", align: "end", cell: (row) => `${totals.budgetMinor === 0 ? 0 : Math.round((row.budgetMinor / totals.budgetMinor) * 100)}%` },
              { key: "spent", header: "Committed", align: "end", cell: (row) => context.money(row.spentMinor) },
              { key: "requirements", header: "Provider requirements", cell: (row) => <span className="ds-subtle">{networkOf(row.network).media}</span>, hideBelow: 1100 },
            ]}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Assets") {
    const creatives = body.creatives ?? [];
    return creatives.length === 0
      ? <Empty title="No creative yet" icon={<PenLine size={20} />} action={<Button variant="secondary" onClick={() => context.openOverlay("Creative preview")}>Open the preview</Button>}>Creative is held on the campaign record. Nothing has been uploaded to a provider.</Empty>
      : (
        <Grid>
          {creatives.map((creative) => (
            <Card key={creative.id} span={4} title={creative.title} subtitle={`${creative.kind} · ${creative.status.replace("_", " ")}`}
              actions={<Pill tone={creative.status === "approved" ? "success" : "warning"}>{creative.status.replace("_", " ")}</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("Creative preview", { creativeId: creative.id })}>Preview</Button>}>
              <div className="t4-net-media">{creative.kind === "video" ? "Video placeholder" : creative.kind === "document" ? "Document placeholder" : "Image placeholder"}</div>
            </Card>
          ))}
        </Grid>
      );
  }

  if (lens === "Channels") {
    return (
      <Stack gap={4}>
        <ProviderBoundary id="site.publish" title="Channel delivery is not connected" />
        <Grid>
          {channels.map((channel) => (
            <Card key={channel.network} span={6} title={networkOf(channel.network).label} subtitle={networkOf(channel.network).media}
              actions={<Pill tone="warning">No account connected</Pill>}>
              <Properties rows={[
                { label: "Budget", value: context.money(channel.budgetMinor) },
                { label: "Committed", value: context.money(channel.spentMinor) },
                { label: "Impressions", value: channel.impressions ? channel.impressions.toLocaleString(org.locale) : "No data recorded" },
                { label: "Clicks", value: channel.clicks ? channel.clicks.toLocaleString(org.locale) : "No data recorded" },
                { label: "Scheduled items", value: String(posts.filter((post) => String(post.fields.network) === channel.network).length) },
              ]} />
            </Card>
          ))}
          {channels.length === 0 && <Empty title="No channels on this plan" />}
        </Grid>
      </Stack>
    );
  }

  if (lens === "Results") {
    const touches = body.touches ?? [];
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Recorded conversions" value={String(totals.conversions)} meta="Stored on the campaign record" />
          <Stat label="Attributed revenue" value={context.money(totals.revenueMinor)} meta="Not a measured causal effect" onClick={() => context.openOverlay("Metric source", { metric: "revenue" })} />
          <Stat label="Cost per conversion" value={totals.conversions === 0 ? "Unavailable" : context.money(Math.round(totals.spentMinor / totals.conversions))} unavailable={totals.conversions === 0} meta={totals.conversions === 0 ? "No conversions recorded" : `${context.money(totals.spentMinor)} committed`} />
          <Stat label="Provider reported results" value="Unavailable" unavailable meta="No ad or mail provider is connected" />
        </StatRow>
        <Card title="First and last touch, as recorded" subtitle="Two models over the same stored touches; neither is a claim of cause">
          <BarChart
            title="Conversions by attribution model"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[
              { name: "First touch", points: touches.map((touch) => ({ label: networkOf(touch.network).label, value: touch.firstTouch })) },
              { name: "Last touch", points: touches.map((touch) => ({ label: networkOf(touch.network).label, value: touch.lastTouch })) },
              { name: "Assisted", points: touches.map((touch) => ({ label: networkOf(touch.network).label, value: touch.assisted })) },
            ]}
            footer="A conversion can appear under more than one model. The models do not sum to the order count."
          />
        </Card>
      </Stack>
    );
  }

  if (lens === "Activity") {
    return (
      <Stack gap={3}>
        <Properties rows={[
          { label: "Created", value: `${context.dateTime(campaign.createdAt)} by ${campaign.createdBy}` },
          { label: "Last change", value: `${context.dateTime(campaign.updatedAt)} by ${campaign.updatedBy}` },
          { label: "Revision", value: String(campaign.revision) },
          { label: "Approval", value: <Pill tone={String(campaign.fields.approval) === "approved" ? "success" : "warning"}>{String(campaign.fields.approval ?? "draft").replace("_", " ")}</Pill> },
        ]} />
        <Card title="Recorded history" subtitle={`${campaign.history.length} earlier version${campaign.history.length === 1 ? "" : "s"}`} flush>
          {campaign.history.length === 0
            ? <div className="ds-card-body"><span className="ds-subtle">No earlier version is stored for this campaign.</span></div>
            : (
              <DataGrid
                rows={campaign.history}
                rowId={(row) => row.at}
                label="Campaign history"
                filterable={false}
                columns={[
                  { key: "at", header: "When", primary: true, cell: (row) => context.dateTime(row.at) },
                  { key: "status", header: "Status", cell: (row) => <Pill>{row.status}</Pill> },
                  { key: "title", header: "Title then", cell: (row) => row.title },
                  { key: "spend", header: "Committed then", align: "end", cell: (row) => context.money(Number(row.fields.spentMinor ?? 0)) },
                ]}
              />
            )}
        </Card>
      </Stack>
    );
  }

  return (
    <Grid>
      <Card span={12} title={campaign.title} subtitle={campaign.summary}
        actions={<Row gap={2}><Pill tone={toneForStatus(campaign.status)} dot>{campaign.status}</Pill><Pill tone="warning">Delivery not connected</Pill></Row>}>
        <Grid>
          <Card span={4} title="Objective" flush><div className="ds-card-body"><strong>{String(campaign.fields.objective ?? "Not set")}</strong><p className="ds-subtle">Owner {campaign.ownerName}</p></div></Card>
          <Card span={4} title="Window" flush><div className="ds-card-body"><strong>{context.date(campaign.startAt)} – {context.date(campaign.endAt)}</strong><p className="ds-subtle">{freshness(campaign.startAt, now).known ? `Started ${context.relative(campaign.startAt)}` : "No start recorded"}</p></div></Card>
          <Card span={4} title="Budget" flush><div className="ds-card-body"><strong>{context.money(totals.budgetMinor)}</strong><p className="ds-subtle">{context.money(totals.spentMinor)} committed locally</p></div></Card>
        </Grid>
      </Card>
      <Card span={6} title="Products in the campaign" subtitle="Linked by the channel plan">
        <Stack gap={2}>
          {(body.creatives ?? []).length === 0 && <span className="ds-subtle">No creative links a product yet.</span>}
          {(body.creatives ?? []).map((creative) => <Row key={creative.id} gap={2}><span className="ds-grow">{creative.title}</span><Pill tone={creative.status === "approved" ? "success" : "warning"}>{creative.status.replace("_", " ")}</Pill></Row>)}
        </Stack>
      </Card>
      <Card span={6} title="Scheduled content" subtitle={`${posts.length} items on this campaign`}>
        {posts.length === 0 ? <span className="ds-subtle">No posts are scheduled against this campaign.</span> : (
          <Stack gap={2}>
            {posts.map((post) => (
              <Row key={post.id} gap={2}>
                <span className="ds-grow ds-truncate">{post.title}</span>
                <span className="ds-subtle">{context.dateTime(post.startAt)}</span>
                <Pill tone={post.status === "published" ? "success" : post.status === "failed" ? "danger" : "warning"}>{post.status}</Pill>
              </Row>
            ))}
          </Stack>
        )}
      </Card>
      <Card span={12}>
        <Notice tone="warning" title="Pausing stops local scheduling only">
          No advertising provider is connected, so pausing this campaign stops the local schedule and records the decision. It cannot stop spend at a provider, because no spend authorisation was ever issued from here.
        </Notice>
      </Card>
    </Grid>
  );
}

/* ---------------------------- MARKET-004 ---------------------------- */

export function ContentCalendar({ context, view }: { context: ScreenContext; view: string }) {
  const data = useMarketData();
  const { now, org } = useWorkspace();
  const [anchor, setAnchor] = useState(() => new Date(now));
  const [networkFilter, setNetworkFilter] = useState("all");
  const [moveError, setMoveError] = useState("");
  const datedPosts = data.socialPosts.filter(post => Boolean(post.startAt));
  const channels = [...new Set(datedPosts.map(post => String(post.fields.network ?? "")).filter(Boolean))].sort();
  const posts = datedPosts.filter(post => networkFilter === "all" || String(post.fields.network) === networkFilter);
  const filters = <div className="t4-market-filters" role="group" aria-label="Content calendar filters">
    <label>Channel
      <Select aria-label="Filter calendar by channel" value={networkFilter}
        onChange={event => { setNetworkFilter(event.target.value); context.select(undefined); }}>
        <option value="all">All channels</option>
        {channels.map(channel => <option key={channel} value={channel}>{networkOf(channel).label}</option>)}
      </Select>
    </label>
    <span className="t4-market-filter-count" role="status" aria-live="polite">{posts.length} of {datedPosts.length} dated items · {org.timezone}</span>
    {networkFilter !== "all" && <Button size="sm" variant="ghost" onClick={() => setNetworkFilter("all")}>Clear channel</Button>}
  </div>;

  if (view === "List") {
    return (
      <Stack gap={4}>
        {filters}
        <DataGrid
        rows={[...posts].sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""))}
        rowId={(row) => row.id}
        label="Scheduled content"
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("Post editor", { id })}
        columns={[
          { key: "title", header: "Item", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${bodyOf<PostBody>(row, {}).caption ?? ""}` },
          { key: "network", header: "Channel", cell: (row) => networkOf(String(row.fields.network)).label, filterValue: (row) => String(row.fields.network) },
          { key: "when", header: "Scheduled", cell: (row) => context.dateTime(row.startAt), sortValue: (row) => row.startAt ?? "" },
          { key: "tz", header: "Time zone", cell: () => org.timezone, hideBelow: 1000 },
          { key: "review", header: "Review", cell: (row) => <Pill tone={String(row.fields.approval) === "approved" ? "success" : "warning"}>{String(row.fields.approval ?? "draft").replace("_", " ")}</Pill> },
          { key: "status", header: "Delivery", cell: (row) => <Pill tone={row.status === "published" ? "success" : row.status === "failed" ? "danger" : "warning"} dot>{row.status === "scheduled" ? "Queued locally" : row.status}</Pill> },
        ]}
      />
      </Stack>
    );
  }

  if (view === "By channel") {
    return (
      <Stack gap={4}>
        {filters}
        <Grid>
        {[...new Set(posts.map((post) => String(post.fields.network)))].map((network) => {
          const list = posts.filter((post) => String(post.fields.network) === network).sort((a, b) => (a.startAt ?? "").localeCompare(b.startAt ?? ""));
          return (
            <Card key={network} span={6} title={networkOf(network).label} subtitle={`${list.length} items · ${networkOf(network).media}`}>
              <Stack gap={2}>
                {list.map((post) => (
                  <button key={post.id} type="button" className="ds-record-card" onClick={() => context.openOverlay("Post editor", { id: post.id })}>
                    <Row gap={2}><strong className="ds-grow" style={{ textAlign: "start" }}>{post.title}</strong><Pill tone={post.status === "published" ? "success" : post.status === "failed" ? "danger" : "warning"}>{post.status}</Pill></Row>
                    <span className="ds-subtle">{context.dateTime(post.startAt)}</span>
                  </button>
                ))}
              </Stack>
            </Card>
          );
        })}
        {posts.length === 0 && <Empty title="No content for this channel" icon={<CalendarCheck size={20} />} />}
      </Grid>
      </Stack>
    );
  }

  const mode = view === "Week" ? "week" : "month";
  return (
    <Stack gap={4}>
      {filters}
      <CalendarToolbar mode={mode} anchor={anchor} onAnchor={setAnchor} now={now} label="Content calendar" />
      <ScheduleCalendar
        mode={mode}
        anchor={anchor}
        now={now}
        label="Scheduled content"
        items={posts.map((post) => ({
          id: post.id,
          title: post.title,
          at: post.startAt!,
          tone: post.status === "published" ? "success" : post.status === "failed" ? "danger" : post.status === "draft" ? "neutral" : "warning",
          meta: `${networkOf(String(post.fields.network)).label} · ${new Date(post.startAt!).toLocaleTimeString(org.locale, { hour: "2-digit", minute: "2-digit" })}`,
          locked: post.status === "published" ? "it is already recorded as published" : undefined,
        }))}
        onOpen={(id) => context.openOverlay("Post editor", { id })}
        onMove={async (id, nextIso) => {
          const post = data.socialPosts.find(item => item.id === id);
          if (!post) return;
          if (post.status === "published") {
            setMoveError("Published items cannot be rescheduled. Duplicate as a draft to create a new plan.");
            return;
          }
          setMoveError("");
          try {
            const result = await context.mutate.patch(id, { startAt: nextIso, at: nextIso },
              { expectRevision: post.revision, event: `${post.title} rescheduled` });
            if (!result) throw new Error("Revision conflict");
            context.toast("Schedule updated", `${post.title} is planned for ${context.dateTime(nextIso)} in ${org.timezone}. Nothing was sent to a provider.`);
          } catch {
            setMoveError("The schedule could not be saved, possibly because this post changed. Review it before trying again.");
          }
        }}
      />
      {moveError && <Notice tone="danger" title="Schedule change not saved">{moveError}</Notice>}
      <Notice tone="info" title={`Times are shown in ${org.timezone}`}>
        A scheduled item is a local record. When the time passes with no connected account the item is marked failed rather than silently dropped.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- MARKET-005 ---------------------------- */

export function SocialPublishing({ context, state }: { context: ScreenContext; state: string }) {
  const data = useMarketData();
  const { org } = useWorkspace();
  const [networkFilter, setNetworkFilter] = useState("all");
  const [busy, setBusy] = useState(false);
  const [writeError, setWriteError] = useState("");
  const map: Record<string, string[]> = { Drafts: ["draft"], Schedule: ["scheduled"], Published: ["published"], Failed: ["failed"] };
  const inState = data.socialPosts.filter((post) => (map[state] ?? ["draft"]).includes(post.status));
  const rows = inState.filter(post => networkFilter === "all" || String(post.fields.network) === networkFilter);
  const channels = [...new Set(data.socialPosts.map(post => String(post.fields.network ?? "")).filter(Boolean))].sort();
  const filterBar = <div className="t4-market-filters" role="group" aria-label="Social publishing filters">
    <label>Channel
      <Select aria-label="Filter social posts by channel" value={networkFilter}
        onChange={event => { setNetworkFilter(event.target.value); context.select(undefined); }}>
        <option value="all">All channels</option>
        {channels.map(network => <option key={network} value={network}>{networkOf(network).label}</option>)}
      </Select>
    </label>
    <span className="t4-market-filter-count" role="status" aria-live="polite">
      {rows.length} of {inState.length} posts in {state.toLowerCase()}
    </span>
    {networkFilter !== "all" && <Button size="sm" variant="ghost" onClick={() => setNetworkFilter("all")}>Clear channel</Button>}
  </div>;

  async function returnToDrafts(selected: Rec[]) {
    if (busy || selected.some(post => post.status === "published")) return;
    setBusy(true);
    setWriteError("");
    try {
      for (const post of selected) {
        const result = await context.mutate.patch(post.id, { status: "draft", fields: { ...post.fields, delivery: "ready_local", error: "" } },
          { expectRevision: post.revision, event: `${post.title} returned to drafts` });
        if (!result) throw new Error("Record revision changed");
      }
      context.toast("Returned to drafts", `${selected.length} post${selected.length === 1 ? "" : "s"} updated locally. No provider was contacted.`);
    } catch {
      setWriteError("Not every post could be moved. Some may already have changed; check the Drafts tab before retrying.");
    } finally {
      setBusy(false);
    }
  }

  const accounts = (
    <details className="t4-social-accounts" aria-label="Social channel account connections">
      <summary>
        <strong>Channel accounts</strong>
        <span>0 of 4 connected · Publishing unavailable until a provider is authorised</span>
        <Pill tone="warning">Not connected</Pill>
      </summary>
      <div className="t4-social-account-list">
        {["instagram", "facebook", "linkedin", "x"].map(network => (
          <div key={network} className="t4-social-account-row">
            <strong>{networkOf(network).label}</strong>
            <span>{networkOf(network).media}</span>
            <Pill tone="warning" dot>Not connected</Pill>
            <Button size="sm" variant="secondary" onClick={() => context.openOverlay("Account authorization", { network })}>Review connection</Button>
          </div>
        ))}
      </div>
    </details>
  );

  if (rows.length === 0) {
    return (
      <Stack gap={4}>
        {accounts}
        {filterBar}
        <Empty title={networkFilter === "all" ? `No ${state.toLowerCase()} posts` : "No posts for this channel"}
          icon={<Megaphone size={20} />}
          action={networkFilter !== "all"
            ? <Button variant="secondary" onClick={() => setNetworkFilter("all")}>Show all channels</Button>
            : <Button variant="primary" onClick={() => context.openOverlay("post composer")}>Create post</Button>}>
          {networkFilter !== "all" ? "Try another channel without changing your posts." : state === "Failed"
            ? "A post can fail when its scheduled time passes without a connected account."
            : "Drafts and scheduled posts remain local until a provider is connected."}
        </Empty>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      {accounts}
      {filterBar}
      {writeError && <Notice tone="danger" title="Some posts need review">{writeError}</Notice>}
      {state === "Failed" && (
        <Notice tone="danger" title="Retrying is blocked while the publication state is unknown">
          None of these posts reached a provider, so there is no external state to compare against. A retry would risk a duplicate if an account were connected in between, so each one must be re-approved individually from its composer.
        </Notice>
      )}
      <DataGrid
        rows={rows}
        rowId={(row) => row.id}
        label={`${state} posts`}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("post composer", { id })}
        rowTone={(row) => (row.status === "failed" ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Post", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${bodyOf<PostBody>(row, {}).caption ?? ""}` },
          { key: "network", header: "Channel", cell: (row) => networkOf(String(row.fields.network)).label },
          { key: "when", header: state === "Published" ? "Recorded" : "Scheduled", cell: (row) => context.dateTime(row.startAt), sortValue: (row) => row.startAt ?? "" },
          { key: "ref", header: "Published URL", cell: (row) => (String(row.fields.externalRef) ? <code>{String(row.fields.externalRef)}</code> : <span className="ds-subtle">None — nothing left this browser</span>), hideBelow: 1100 },
          { key: "error", header: "Error", cell: (row) => (String(row.fields.error) ? String(row.fields.error) : <span className="ds-subtle">—</span>), hideBelow: 1300 },
          { key: "delivery", header: "State", cell: (row) => <Pill tone={row.status === "published" ? "success" : row.status === "failed" ? "danger" : "warning"} dot>{String(row.fields.delivery ?? row.status).replace("_", " ")}</Pill> },
        ]}
        bulkActions={[
          {
            label: "Open delivery receipt",
            disabled: (selected) => selected.length !== 1,
            onRun: (selected) => context.openOverlay("delivery receipt", { id: selected[0]?.id }),
          },
          {
            label: "Move to drafts",
            disabled: selected => busy || selected.some(post => post.status === "published"),
            onRun: selected => { void returnToDrafts(selected); },
          },
        ]}
        summary={<span>Accounts connected: 0 of 4 · workspace {org.shortName}</span>}
      />
    </Stack>
  );
}

/* ---------------------------- MARKET-006 ---------------------------- */

export function EmailCampaigns({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const [campaignFilter, setCampaignFilter] = useState<"all" | "draft" | "approval" | "active">("all");
  const emailCampaigns = data.campaigns.filter((campaign) => (bodyOf<CampaignBody>(campaign, {}).channels ?? []).some((channel) => channel.network === "email"));
  const visibleEmailCampaigns = campaignFilter === "all" ? emailCampaigns
    : emailCampaigns.filter(campaign => campaign.status === campaignFilter);
  const campaignToolbar = <div className="t4-market-filters" role="group" aria-label="Email campaign status filters">
    <Segmented label="Email campaign status" value={campaignFilter} onChange={value => { setCampaignFilter(value); context.select(undefined); }}
      options={[{ value: "all", label: "All" }, { value: "draft", label: "Draft" }, { value: "approval", label: "Review" }, { value: "active", label: "Active" }]} />
    <span className="t4-market-filter-count" role="status" aria-live="polite">
      {visibleEmailCampaigns.length} of {emailCampaigns.length} campaign plans · no mail provider connected
    </span>
  </div>;
  const emailTemplates = data.templates.filter((template) => String(template.fields.kind) === "email");

  if (lens === "Templates") {
    return emailTemplates.length === 0
      ? <Empty title="No email templates" icon={<Mail size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("email builder")}>Build an email</Button>} />
      : (
        <Grid>
          {emailTemplates.map((template) => {
            const body = bodyOf<{ subject?: string; preheader?: string; blocks?: string[] }>(template, {});
            return (
              <Card key={template.id} span={4} title={template.title} subtitle={body.subject ?? template.summary}
                actions={<Pill tone={template.status === "approved" ? "success" : template.status === "archived" ? "neutral" : "warning"}>{template.status}</Pill>}
                footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("email builder", { templateId: template.id })}>Open</Button>}>
                <Stack gap={2}>
                  <span className="ds-subtle">{body.preheader}</span>
                  <Row gap={1} wrap>{(body.blocks ?? []).map((block) => <Pill key={block}>{block}</Pill>)}</Row>
                </Stack>
              </Card>
            );
          })}
        </Grid>
      );
  }

  if (lens === "Audiences") {
    return (
      <Stack gap={4}>
        <ProviderBoundary id="email.send" />
        <DataGrid
          rows={data.audiences}
          rowId={(row) => row.id}
          label="Email audiences"
          onOpen={(id) => context.openOverlay("Audience preview", { id })}
          columns={[
            { key: "title", header: "Segment", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
            { key: "members", header: "Eligible now", align: "end", cell: (row) => String(evaluateSegment(row, data.contacts, now).members.length), sortValue: (row) => evaluateSegment(row, data.contacts, now).members.length },
            { key: "held", header: "Held back", align: "end", cell: (row) => String(evaluateSegment(row, data.contacts, now).excluded.length) },
            { key: "consent", header: "Consent rule", cell: (row) => (row.fields.consentRequired === true ? <Pill tone="success">Consent required</Pill> : <Pill tone="danger">No consent rule</Pill>) },
          ]}
        />
      </Stack>
    );
  }

  if (lens === "Reports") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Emails sent" value="0" meta="No mail provider has ever been connected" />
          <Stat label="Open rate" value="Unavailable" unavailable meta="Needs a provider to report opens" onClick={() => context.openOverlay("Metric source", { metric: "email" })} />
          <Stat label="Click rate" value="Unavailable" unavailable meta="Needs a provider to report clicks" />
          <Stat label="Recorded email conversions" value={String(rollUp(data.campaigns).find((channel) => channel.network === "email")?.conversions ?? 0)} meta="From campaign records" />
        </StatRow>
        <Notice tone="warning" title="Email reporting cannot be filled in">
          Opens and clicks are measured by the sending provider. With no provider connected those rows stay unavailable rather than being shown as zero, which would read as a bad result instead of no data.
        </Notice>
      </Stack>
    );
  }

  return <Stack gap={4}>
    {campaignToolbar}
    {visibleEmailCampaigns.length === 0
      ? <Empty title={campaignFilter === "all" ? "No email campaigns" : "No campaign plans in this status"}
          icon={<Mail size={20} />}
          action={campaignFilter === "all"
            ? <Button variant="primary" onClick={() => context.openOverlay("email builder")}>Build an email</Button>
            : <Button variant="secondary" onClick={() => setCampaignFilter("all")}>Show all campaign plans</Button>}>
          Drafts, approval and launch status are workspace records; no email has been sent from this interface.
        </Empty>
      : <DataGrid
        rows={visibleEmailCampaigns}
        rowId={(row) => row.id}
        label="Email campaigns"
        selectedId={context.selectedId}
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("email builder", { id })}
        columns={[
          { key: "title", header: "Campaign", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
          { key: "audience", header: "Audience", cell: (row) => data.audiences.find((audience) => audience.id === String(row.fields.audienceId))?.title ?? "Not linked" },
          { key: "recipients", header: "Eligible", align: "end", cell: (row) => String(evaluateSegment(data.audiences.find((audience) => audience.id === String(row.fields.audienceId)), data.contacts, now).members.length) },
          { key: "window", header: "Window", cell: (row) => `${context.date(row.startAt)} – ${context.date(row.endAt)}` },
          { key: "state", header: "State", cell: (row) => <Pill tone={toneForStatus(row.status)} dot>{row.status}</Pill> },
          { key: "delivery", header: "Delivery", cell: () => <Pill tone="warning">Not connected</Pill> },
        ]}
      />}
    <Notice tone="info" title="Email preparation is local">
      Campaign status, segment eligibility and send windows are stored in this workspace. No external email delivery, open-rate or click-rate evidence is available.
    </Notice>
  </Stack>;
}

/* ---------------------------- MARKET-007 ---------------------------- */

export function AudienceSegments({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const { now } = useWorkspace();

  if (lens === "Contacts") {
    return (
      <DataGrid
        rows={data.contacts}
        rowId={(row) => row.id}
        label="Contacts"
        onSelect={(id) => context.select(id)}
        onOpen={(id) => context.openOverlay("consent inspector", { id })}
        rowTone={(row) => (row.fields.suppressed === true ? "danger" : undefined)}
        columns={[
          { key: "title", header: "Contact", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${String(row.fields.email ?? "")}` },
          { key: "email", header: "Email", cell: (row) => String(row.fields.email ?? "Not recorded"), hideBelow: 900 },
          { key: "segment", header: "Segment", cell: (row) => <Pill>{String(row.fields.segment ?? "unknown")}</Pill> },
          { key: "city", header: "City", cell: (row) => String(row.fields.city ?? "—"), hideBelow: 1100 },
          { key: "orders", header: "Orders", align: "end", cell: (row) => String(row.fields.ordersCount ?? 0), sortValue: (row) => Number(row.fields.ordersCount ?? 0) },
          { key: "spend", header: "Lifetime", align: "end", cell: (row) => context.money(Number(row.fields.spendMinor ?? 0)), sortValue: (row) => Number(row.fields.spendMinor ?? 0) },
          { key: "consent", header: "Consent", cell: (row) => (
            <Row gap={1}>
              {row.fields.consentEmail === true ? <Pill tone="success">Email</Pill> : <Pill tone="warning">No email</Pill>}
              {row.fields.consentMarketing === true && <Pill tone="info">Marketing</Pill>}
              {row.fields.suppressed === true && <Pill tone="danger">Suppressed</Pill>}
            </Row>
          ) },
        ]}
      />
    );
  }

  if (lens === "Exclusions") {
    const suppressed = data.contacts.filter((contact) => contact.fields.suppressed === true);
    const noConsent = data.contacts.filter((contact) => contact.fields.consentEmail !== true);
    return (
      <Grid>
        <Card span={6} title="Suppression list" subtitle={`${suppressed.length} contacts will never receive outreach`}>
          {suppressed.length === 0 ? <span className="ds-subtle">Nobody is suppressed.</span> : (
            <Stack gap={2}>
              {suppressed.map((contact) => (
                <Row key={contact.id} gap={2}>
                  <span className="ds-grow">{contact.title}</span>
                  <span className="ds-subtle">{String(contact.fields.email ?? "")}</span>
                  <Button size="sm" variant="ghost" onClick={() => context.openOverlay("consent inspector", { id: contact.id })}>Why</Button>
                </Row>
              ))}
            </Stack>
          )}
        </Card>
        <Card span={6} title="No email consent recorded" subtitle={`${noConsent.length} contacts are ineligible for email`}>
          <Stack gap={2}>
            {noConsent.map((contact) => <Row key={contact.id} gap={2}><span className="ds-grow">{contact.title}</span><Pill tone="warning">Ineligible</Pill></Row>)}
            {noConsent.length === 0 && <span className="ds-subtle">Every contact has recorded email consent.</span>}
          </Stack>
        </Card>
        <Card span={12}>
          <Notice tone="danger" title="A send cannot include these contacts">
            Suppressed and non-consenting contacts are removed from every segment count before a send review, and the review states how many were held back and why.
          </Notice>
        </Card>
      </Grid>
    );
  }

  if (lens === "Sources") {
    const bySegment = [...new Set(data.contacts.map((contact) => String(contact.fields.segment ?? "unknown")))];
    return (
      <Grid>
        <Card span={6} title="Where the contacts come from" subtitle="This workspace only — no list was imported or bought">
          <Properties rows={[
            { label: "Contact records", value: String(data.contacts.length) },
            { label: "With email consent", value: String(data.contacts.filter((contact) => contact.fields.consentEmail === true).length) },
            { label: "With marketing consent", value: String(data.contacts.filter((contact) => contact.fields.consentMarketing === true).length) },
            { label: "Suppressed", value: String(data.contacts.filter((contact) => contact.fields.suppressed === true).length) },
            { label: "Provider sync", value: <Pill tone="warning">Not connected</Pill> },
          ]} />
        </Card>
        <Card span={6} title="Segments present in the data">
          <DonutChart
            title="Contacts by segment"
            points={bySegment.map((segment) => ({ label: segment, value: data.contacts.filter((contact) => String(contact.fields.segment ?? "unknown") === segment).length }))}
            format={(value) => String(Math.round(value))}
          />
        </Card>
      </Grid>
    );
  }

  return <AudienceSegmentsLibrary context={context} />;
}

/* ---------------------------- MARKET-008 ---------------------------- */

export function Advertising({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const { org } = useWorkspace();
  const paid = data.campaigns.filter((campaign) => (bodyOf<CampaignBody>(campaign, {}).channels ?? []).some((channel) => ["search", "instagram", "facebook", "linkedin", "x"].includes(channel.network)));
  const channels = rollUp(paid);
  const totals = channelTotals(channels);

  if (lens === "Accounts") {
    return (
      <Stack gap={4}>
        <ProviderBoundary id="payment.capture" title="No ad account is connected" />
        <Grid>
          {["Google Ads", "Meta Ads", "LinkedIn Ads", "X Ads"].map((platform) => (
            <Card key={platform} span={6} title={platform} subtitle="No account, no spend authorisation, no reported figures"
              actions={<Pill tone="warning" dot>Not connected</Pill>}
              footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("Account authorization", { network: platform })}>Connect</Button>}>
              <Properties rows={[
                { label: "Account id", value: "Unavailable" },
                { label: "Daily cap", value: "Unavailable" },
                { label: "Reported spend", value: "Unavailable" },
                { label: "Local plan", value: context.money(channels.reduce((sum, channel) => sum + channel.budgetMinor, 0)) },
              ]} />
            </Card>
          ))}
        </Grid>
      </Stack>
    );
  }

  if (lens === "Creative") {
    const creatives = paid.flatMap((campaign) => (bodyOf<CampaignBody>(campaign, {}).creatives ?? []).map((creative) => ({ ...creative, campaign })));
    return creatives.length === 0
      ? <Empty title="No ad creative" icon={<PenLine size={20} />} />
      : (
        <Grid>
          {creatives.map((creative) => (
            <Card key={`${creative.campaign.id}-${creative.id}`} span={4} title={creative.title} subtitle={creative.campaign.title}
              footer={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("Ad preview", { campaignId: creative.campaign.id, creativeId: creative.id })}>Preview</Button>}>
              <div className="t4-net-media">{creative.kind} placeholder</div>
              <Row gap={2} style={{ marginBlockStart: "var(--space-2)" }}>
                <Pill tone={creative.status === "approved" ? "success" : "warning"}>{creative.status.replace("_", " ")}</Pill>
              </Row>
            </Card>
          ))}
        </Grid>
      );
  }

  if (lens === "Spend") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Planned" value={context.money(totals.budgetMinor)} meta="Sum of channel budgets on campaign records" />
          <Stat label="Committed locally" value={context.money(totals.spentMinor)} meta="Recorded against campaigns here" onClick={() => context.openOverlay("budget inspector")} />
          <Stat label="Provider spend" value="Unavailable" unavailable meta="No account is connected to report it" />
          <Stat label="Reserve needed" value={context.money(Math.round(totals.spentMinor * 0.15))} meta="15% buffer against late provider reporting" onClick={() => context.openOverlay("spend approval")} />
        </StatRow>
        <Notice tone="warning" title="Provider spend arrives late, so a buffer is held">
          Ad platforms report spend hours after it happens. Any allocation here keeps a fifteen percent reserve so a late figure cannot push the campaign past its budget. No authorisation has been issued, so the reserve is a planning figure only.
        </Notice>
        <Card title="Committed against planned, by channel" flush>
          <DataGrid
            rows={channels}
            rowId={(row) => row.network}
            label="Spend by channel"
            filterable={false}
            columns={[
              { key: "network", header: "Channel", primary: true, cell: (row) => networkOf(row.network).label },
              { key: "budget", header: "Planned", align: "end", cell: (row) => context.money(row.budgetMinor), sortValue: (row) => row.budgetMinor },
              { key: "spent", header: "Committed", align: "end", cell: (row) => context.money(row.spentMinor), sortValue: (row) => row.spentMinor },
              { key: "used", header: "Used", cell: (row) => <Meter value={row.spentMinor} max={row.budgetMinor || 1} label={`${row.network} budget used`} tone={row.spentMinor > row.budgetMinor * 0.85 ? "warning" : undefined} /> },
              { key: "reserve", header: "Reserve", align: "end", cell: (row) => context.money(Math.round(row.spentMinor * 0.15)) },
            ]}
          />
        </Card>
      </Stack>
    );
  }

  if (lens === "Exceptions") {
    const exceptions = paid.flatMap((campaign) => {
      const campaignTotals = channelTotals(bodyOf<CampaignBody>(campaign, {}).channels ?? []);
      const list: { id: string; campaign: Rec; title: string; detail: string }[] = [];
      if (campaignTotals.budgetMinor && campaignTotals.spentMinor > campaignTotals.budgetMinor * 0.85) {
        list.push({ id: `${campaign.id}-cap`, campaign, title: "Approaching its budget", detail: `${context.money(campaignTotals.spentMinor)} of ${context.money(campaignTotals.budgetMinor)} committed.` });
      }
      if (campaign.status === "active" && campaignTotals.conversions === 0 && campaignTotals.spentMinor > 0) {
        list.push({ id: `${campaign.id}-conv`, campaign, title: "Spend with no recorded conversion", detail: "Either the conversion was not recorded here or the channel is not working. Both are possible; neither is assumed." });
      }
      if ((bodyOf<CampaignBody>(campaign, {}).creatives ?? []).some((creative) => creative.status !== "approved")) {
        list.push({ id: `${campaign.id}-creative`, campaign, title: "Creative is not approved", detail: "An unapproved creative cannot be part of a launch approval." });
      }
      return list;
    });
    return exceptions.length === 0
      ? <Empty title="No exceptions" >Exceptions are computed from campaign records: budget pressure, spend without a recorded conversion and unapproved creative.</Empty>
      : (
        <Stack gap={3}>
          {exceptions.map((exception) => (
            <Card key={exception.id} title={`${exception.campaign.title} · ${exception.title}`} subtitle={exception.detail}
              actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("campaign diagnostics", { id: exception.campaign.id })}>Diagnose</Button>} />
          ))}
        </Stack>
      );
  }

  return (
    <DataGrid
      rows={paid}
      rowId={(row) => row.id}
      label="Advertising campaigns"
      selectedId={context.selectedId}
      onSelect={(id) => context.select(id)}
      onOpen={(id) => context.navigate(`/o/${org.slug}/market/campaigns/${id}`)}
      columns={[
        { key: "title", header: "Campaign", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
        { key: "channels", header: "Placements", cell: (row) => (bodyOf<CampaignBody>(row, {}).channels ?? []).filter((channel) => channel.network !== "email").map((channel) => networkOf(channel.network).label).join(", ") },
        { key: "budget", header: "Budget", align: "end", cell: (row) => context.money(Number(row.fields.budgetMinor ?? 0)), sortValue: (row) => Number(row.fields.budgetMinor ?? 0) },
        { key: "spent", header: "Committed", align: "end", cell: (row) => context.money(Number(row.fields.spentMinor ?? 0)) },
        { key: "status", header: "Status", cell: (row) => <Pill tone={toneForStatus(row.status)} dot>{row.status}</Pill> },
        { key: "authorised", header: "Spend authorised", cell: () => <Pill tone="warning">Never issued</Pill>, hideBelow: 1100 },
      ]}
    />
  );
}

/* ---------------------------- MARKET-009 ---------------------------- */

export function SeoContent({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const { now } = useWorkspace();
  const audit = data.sites.find((site) => String(site.fields.kind) === "audit");
  const body = bodyOf<SiteBody>(audit, {});
  const age = freshness(String(audit?.fields.lastRunAt ?? ""), now, 7);

  if (!audit) return <Empty title="No site audit recorded" icon={<Search size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("technical recommendation")}>Run an audit</Button>} />;

  if (lens === "Content") {
    return (
      <Grid>
        <Card span={12} title="Content briefs" subtitle="Each brief names the keyword it answers" flush>
          <DataGrid
            rows={body.briefs ?? []}
            rowId={(row) => row.id}
            label="Content briefs"
            filterable={false}
            columns={[
              { key: "title", header: "Brief", primary: true, cell: (row) => row.title },
              { key: "keyword", header: "Target keyword", cell: (row) => <code>{row.keyword}</code> },
              { key: "stage", header: "Stage", cell: (row) => <Pill tone={row.stage === "drafting" ? "info" : "neutral"}>{row.stage}</Pill> },
              { key: "owner", header: "Owner", cell: (row) => row.owner },
            ]}
            empty={<Empty title="No briefs" >A brief is written against a keyword in the table, not invented.</Empty>}
          />
        </Card>
      </Grid>
    );
  }

  if (lens === "Keywords") {
    return (
      <Stack gap={4}>
        <Notice tone="warning" title="Positions are a recorded observation, not a forecast">
          These positions were recorded {age.known ? `${age.days} days ago` : "at an unknown time"} against the saved page model. Rankings move for reasons outside this workspace, so no target position is promised.
        </Notice>
        <DataGrid
          rows={body.keywords ?? []}
          rowId={(row) => row.term}
          label="Keyword opportunities"
          columns={[
            { key: "term", header: "Keyword", primary: true, cell: (row) => row.term, filterValue: (row) => row.term },
            { key: "volume", header: "Monthly volume", align: "end", cell: (row) => row.volume.toLocaleString(), sortValue: (row) => row.volume },
            { key: "position", header: "Recorded position", align: "end", cell: (row) => String(row.position), sortValue: (row) => row.position },
            { key: "difficulty", header: "Difficulty", align: "end", cell: (row) => String(row.difficulty), sortValue: (row) => row.difficulty },
            { key: "page", header: "Page", cell: (row) => <code>{row.page}</code> },
          ]}
        />
      </Stack>
    );
  }

  if (lens === "Technical") {
    const technical = (body.issues ?? []).filter((issue) => issue.title.includes("paint") || issue.title.includes("H1") || issue.title.includes("alt"));
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Pages crawled" value={String(audit.fields.crawledPages ?? 0)} meta="From the saved page model in this browser" />
          <Stat label="High severity" value={String(audit.fields.issuesHigh ?? 0)} meta="Blocking issues" />
          <Stat label="Last run" value={age.known ? context.date(String(audit.fields.lastRunAt)) : "Unavailable"} unavailable={!age.known} meta={age.known ? `${age.days} days ago${age.stale ? " · stale" : ""}` : "No run recorded"} />
          <Stat label="Live crawl" value="Unavailable" unavailable meta="No crawler service is connected" />
        </StatRow>
        <Stack gap={3}>
          {technical.map((issue) => (
            <Card key={issue.id} title={issue.title} subtitle={`${issue.page} · ${issue.severity}`}
              actions={<Button size="sm" variant="secondary" onClick={() => context.openOverlay("technical recommendation", { issueId: issue.id })}>Recommendation</Button>}>
              <p className="ds-prose">{issue.detail}</p>
            </Card>
          ))}
          {technical.length === 0 && <Empty title="No technical issues recorded" />}
        </Stack>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <StatRow>
        <Stat label="Issues found" value={String((body.issues ?? []).length)} meta={`${audit.fields.issuesHigh ?? 0} high · ${audit.fields.issuesMedium ?? 0} medium · ${audit.fields.issuesLow ?? 0} low`} />
        <Stat label="Pages crawled" value={String(audit.fields.crawledPages ?? 0)} meta="Saved page model" />
        <Stat label="Assigned" value={String((body.issues ?? []).filter((issue) => issue.assignee).length)} meta="Issues with an owner" />
        <Stat label="Audit age" value={age.known ? `${age.days} days` : "Unknown"} unavailable={!age.known} meta={age.stale ? "Older than a week" : "Current"} />
      </StatRow>
      <DataGrid
        rows={body.issues ?? []}
        rowId={(row) => row.id}
        label="Audit issues"
        onOpen={(id) => context.openOverlay("Audit issue", { issueId: id })}
        rowTone={(row) => (row.severity === "high" ? "danger" : row.severity === "medium" ? "warning" : undefined)}
        columns={[
          { key: "title", header: "Issue", primary: true, cell: (row) => row.title, filterValue: (row) => `${row.title} ${row.page}` },
          { key: "page", header: "Page", cell: (row) => <code>{row.page}</code> },
          { key: "severity", header: "Severity", cell: (row) => <Pill tone={row.severity === "high" ? "danger" : row.severity === "medium" ? "warning" : "neutral"}>{row.severity}</Pill> },
          { key: "assignee", header: "Owner", cell: (row) => row.assignee || <span className="ds-subtle">Unassigned</span> },
        ]}
      />
    </Stack>
  );
}

/* ---------------------------- MARKET-010 ---------------------------- */

export function LandingPages({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const pages = data.sites.filter((site) => String(site.fields.kind) === "page");
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [device, setDevice] = useState<"phone" | "tablet" | "desktop">("desktop");
  const page = pages.find((item) => item.id === (selected ?? context.selectedId)) ?? pages[0];

  if (pages.length === 0) {
    return <Empty title="No landing pages" icon={<PenLine size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Page template")}>Create a page</Button>} />;
  }

  if (lens === "Builder") {
    const body = bodyOf<SiteBody>(page, {});
    return (
      <Grid>
        <Card span={3} title="Pages">
          <Stack gap={2}>
            {pages.map((item) => (
              <button key={item.id} type="button" className="ds-record-card" aria-pressed={item.id === page?.id} onClick={() => { setSelected(item.id); context.select(item.id); }}>
                <strong style={{ textAlign: "start" }}>{item.title}</strong>
                <span className="ds-subtle">/{String(item.fields.slug)}</span>
              </button>
            ))}
          </Stack>
        </Card>
        <Card span={9} title={page?.title ?? "Select a page"} subtitle={`Blocks are records; the preview renders them in order`}
          actions={<Segmented label="Preview width" value={device} onChange={setDevice} options={[{ value: "phone", label: "390" }, { value: "tablet", label: "768" }, { value: "desktop", label: "Full" }]} />}>
          <Stack gap={3}>
            <div className="t4-device" style={{ maxWidth: device === "phone" ? 390 : device === "tablet" ? 768 : "none", marginInline: device === "desktop" ? undefined : "auto" }}>
              <div className="t4-device-head">{device === "phone" ? "390 × 844" : device === "tablet" ? "768 wide" : "Full width"} · /{String(page?.fields.slug ?? "")}</div>
              <div className="t4-device-body">
                {(body.blocks ?? []).map((block) => (
                  <div key={block.id} className="ds-panel" style={{ padding: "var(--space-3)" }}>
                    <Row gap={2}><Pill>{block.kind}</Pill><strong className="ds-grow">{block.heading}</strong></Row>
                    {block.body && <p className="ds-subtle">{block.body}</p>}
                    {block.productSkus && <Row gap={1} wrap>{block.productSkus.map((sku) => <Pill key={sku} tone="accent">{sku}</Pill>)}</Row>}
                    {block.fields && <Row gap={1} wrap>{block.fields.map((field) => <Pill key={field}>{field}</Pill>)}</Row>}
                  </div>
                ))}
                {(body.blocks ?? []).length === 0 && <Empty title="No blocks on this page" />}
              </div>
            </div>
            <ProviderBoundary id="site.publish" />
          </Stack>
        </Card>
      </Grid>
    );
  }

  if (lens === "Tests") {
    const variants = pages.filter((item) => String(item.fields.campaignId) && String(item.fields.variant));
    const groups = [...new Set(variants.map((item) => String(item.fields.campaignId)))];
    return (
      <Stack gap={4}>
        <PageChecksCard context={context} />
        {groups.map((campaignId) => {
          const members = variants.filter((item) => String(item.fields.campaignId) === campaignId);
          const campaign = data.campaigns.find((item) => item.id === campaignId);
          const best = [...members].sort((a, b) => Number(b.fields.conversions ?? 0) / Math.max(1, Number(b.fields.views ?? 1)) - Number(a.fields.conversions ?? 0) / Math.max(1, Number(a.fields.views ?? 1)))[0];
          return (
            <Card key={campaignId} span={12} title={`Test · ${campaign?.title ?? "Unlinked campaign"}`} subtitle={`${members.length} variants`} flush>
              <DataGrid
                rows={members}
                rowId={(row) => row.id}
                label="Variants"
                filterable={false}
                columns={[
                  { key: "variant", header: "Variant", primary: true, cell: (row) => `${String(row.fields.variant)} · ${row.title}` },
                  { key: "views", header: "Views", align: "end", cell: (row) => String(row.fields.views ?? 0) },
                  { key: "conv", header: "Conversions", align: "end", cell: (row) => String(row.fields.conversions ?? 0) },
                  { key: "rate", header: "Rate", align: "end", cell: (row) => `${((Number(row.fields.conversions ?? 0) / Math.max(1, Number(row.fields.views ?? 0))) * 100).toFixed(2)}%` },
                  { key: "state", header: "State", cell: (row) => <Pill tone={row.id === best?.id ? "success" : "neutral"}>{row.id === best?.id ? "Leading" : row.status}</Pill> },
                ]}
              />
              <div className="ds-card-body">
                <Notice tone="warning" title="Not a significant result">
                  {members.map((member) => `${String(member.fields.variant)}: ${member.fields.conversions} of ${member.fields.views}`).join(" · ")}. With these counts the difference is within ordinary variation, so no winner is declared.
                </Notice>
              </div>
            </Card>
          );
        })}
        {groups.length === 0 && <Empty title="No variant tests" >A variant test needs two pages linked to the same campaign with different variants.</Empty>}
      </Stack>
    );
  }

  if (lens === "Analytics") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Recorded views" value={pages.reduce((sum, item) => sum + Number(item.fields.views ?? 0), 0).toLocaleString()} meta="Stored on each page record" onClick={() => context.openOverlay("Metric source", { metric: "pageviews" })} />
          <Stat label="Recorded conversions" value={String(pages.reduce((sum, item) => sum + Number(item.fields.conversions ?? 0), 0))} meta="Form submissions kept locally" />
          <Stat label="Live analytics" value="Unavailable" unavailable meta="No analytics or consent banner is connected" />
          <Stat label="Published pages" value={String(pages.filter((item) => item.fields.published === true).length)} meta={`of ${pages.length} pages`} />
        </StatRow>
        <Card title="Views and conversions by page" flush>
          <DataGrid
            rows={pages}
            rowId={(row) => row.id}
            label="Page analytics"
            columns={[
              { key: "title", header: "Page", primary: true, cell: (row) => row.title, filterValue: (row) => row.title },
              { key: "slug", header: "Path", cell: (row) => <code>/{String(row.fields.slug)}</code> },
              { key: "views", header: "Views", align: "end", cell: (row) => Number(row.fields.views ?? 0).toLocaleString(), sortValue: (row) => Number(row.fields.views ?? 0) },
              { key: "conv", header: "Conversions", align: "end", cell: (row) => String(row.fields.conversions ?? 0), sortValue: (row) => Number(row.fields.conversions ?? 0) },
              { key: "published", header: "Published", cell: (row) => (row.fields.published === true ? <Pill tone="success">Exported locally</Pill> : <Pill tone="warning">Draft</Pill>) },
            ]}
          />
        </Card>
      </Stack>
    );
  }

  return (
    <Grid>
      {pages.map((item) => (
        <Card key={item.id} span={4} title={item.title} subtitle={`/${String(item.fields.slug)}`}
          actions={<Pill tone={item.fields.published === true ? "success" : "warning"}>{item.fields.published === true ? "Published locally" : item.status}</Pill>}
          footer={<>
            <Button size="sm" variant="secondary" onClick={() => { setSelected(item.id); context.select(item.id); context.setTab("Builder"); }}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("publish confirm", { id: item.id })}>Publish</Button>
            <Button size="sm" variant="ghost" onClick={() => context.openOverlay("version compare", { id: item.id })}>Versions</Button>
          </>}>
          <Properties rows={[
            { label: "Blocks", value: String((bodyOf<SiteBody>(item, {}).blocks ?? []).length) },
            { label: "Views", value: Number(item.fields.views ?? 0).toLocaleString() },
            { label: "Conversions", value: String(item.fields.conversions ?? 0) },
            { label: "Meta title", value: String(item.fields.metaTitle || "Not set") },
          ]} />
        </Card>
      ))}
    </Grid>
  );
}

/* ---------------------------- MARKET-011 ---------------------------- */

const MODELS = ["Last touch", "First touch", "Linear", "Unattributed"] as const;

export function Attribution({ context, lens }: { context: ScreenContext; lens: string }) {
  const data = useMarketData();
  const { org, now } = useWorkspace();
  const [model, setModel] = useState<(typeof MODELS)[number]>("Last touch");
  const filter = useAttributionFilter();
  const inFilter = (network: string) => filter.networks.length === 0 || filter.networks.includes(network);
  const allChannels = rollUp(data.campaigns);
  const channels = allChannels.filter((channel) => inFilter(channel.network));
  const totals = channelTotals(allChannels);
  const touches = useMemo(() => {
    const map = new Map<string, { network: string; firstTouch: number; lastTouch: number; assisted: number }>();
    for (const campaign of data.campaigns) {
      for (const touch of bodyOf<CampaignBody>(campaign, {}).touches ?? []) {
        const found = map.get(touch.network);
        if (found) {
          found.firstTouch += touch.firstTouch;
          found.lastTouch += touch.lastTouch;
          found.assisted += touch.assisted;
        } else map.set(touch.network, { ...touch });
      }
    }
    return [...map.values()];
  }, [data.campaigns]);
  const shownTouches = touches.filter((touch) => inFilter(touch.network));
  const filterNote = filter.networks.length > 0 && (
    <Notice tone="info" title={`Filtered to ${filter.networks.map((network) => networkOf(network).label).join(", ")}`}
      actions={<Button size="sm" variant="ghost" onClick={() => attributionFilter.set({ networks: [] })}>Clear filter</Button>}>
      Order totals and the unattributed figure still count every order.
    </Notice>
  );

  const orders = data.orders.filter((order) => order.status !== "cancelled");
  const unattributed = Math.max(0, orders.length - totals.conversions);

  if (lens === "Funnels") {
    const stages = [
      { label: "Recorded impressions", value: totals.impressions },
      { label: "Clicks", value: totals.clicks },
      { label: "Leads", value: data.leads.length },
      { label: "Deals opened", value: data.deals.length },
      { label: "Orders", value: orders.length },
    ];
    return (
      <Stack gap={4}>
        <Card title="Funnel from recorded counts" subtitle="Each step is a count of records, so the steps come from different sources">
          <Stack gap={3}>
            {stages.map((stage, index) => (
              <div key={stage.label}>
                <Row gap={2}><strong className="ds-grow">{stage.label}</strong><span className="ds-num">{stage.value.toLocaleString(org.locale)}</span></Row>
                <Meter value={stage.value} max={stages[0].value || 1} label={stage.label} />
                {index > 0 && <span className="ds-subtle">{stages[index - 1].value === 0 ? "No previous step recorded" : `${((stage.value / stages[index - 1].value) * 100).toFixed(1)}% of the step above`}</span>}
              </div>
            ))}
          </Stack>
        </Card>
        <Notice tone="warning" title="These steps are not one funnel">
          Impressions and clicks come from figures stored on campaign records. Leads, deals and orders are separate records that may have no recorded campaign at all. The ratios are therefore descriptive, not a conversion rate.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Revenue") {
    return (
      <Stack gap={4}>
        <StatRow>
          <Stat label="Order revenue" value={context.money(orders.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0))} meta={`${orders.length} orders, excluding cancellations`} onClick={() => context.openOverlay("source inspector", { metric: "orders" })} />
          <Stat label="Claimed by campaigns" value={context.money(totals.revenueMinor)} meta="Sum of the revenue field on channel plans" onClick={() => context.openOverlay("Attribution model")} />
          <Stat label="Double counted" value={context.money(Math.max(0, totals.revenueMinor - orders.reduce((sum, order) => sum + (order.amountMinor ?? 0), 0)))} meta="Where channels claim the same order" />
          <Stat label="Unattributed orders" value={String(unattributed)} meta="No campaign claims them" />
        </StatRow>
        <Notice tone="danger" title="Campaign revenue exceeds order revenue">
          More than one channel can claim the same order, so the sum of channel revenue is larger than the money actually recorded. The figure on the left is the only one reconciled to order records.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Cohorts") {
    const cohorts = [0, 1, 2, 3].map((back) => {
      const month = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const next = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      const inMonth = data.contacts.filter((contact) => {
        const first = String(contact.fields.lastOrderAt ?? "");
        return first && new Date(first) >= month && new Date(first) < next;
      });
      return { month, inMonth };
    });
    return (
      <Stack gap={4}>
        <Card title="Customers by the month of their most recent order" subtitle="Derived from the lastOrderAt field on contact records">
          <BarChart
            title="Contacts by recent order month"
            height={200}
            format={(value) => String(Math.round(value))}
            series={[{ name: "Contacts", points: [...cohorts].reverse().map((cohort) => ({ label: cohort.month.toLocaleString(org.locale, { month: "short" }), value: cohort.inMonth.length })) }]}
            footer="This is recency, not a retention cohort: the workspace does not record a first-order date."
          />
        </Card>
        <Notice tone="warning" title="A true cohort needs a first-order date">
          Contact records hold the most recent order date only. Grouping by first purchase would require a field that is not stored, so it is not shown rather than approximated.
        </Notice>
      </Stack>
    );
  }

  if (lens === "Models") {
    const credit = (row: { firstTouch: number; lastTouch: number; assisted: number }, name: (typeof MODELS)[number]) =>
      name === "First touch" ? row.firstTouch : name === "Last touch" ? row.lastTouch : name === "Linear" ? Math.round((row.firstTouch + row.lastTouch + row.assisted) / 3) : 0;
    return (
      <Stack gap={4}>
        {filterNote}
        <Card title="Models side by side" subtitle="Conversions credited to each channel under every model, from the same stored touches" flush>
          <DataGrid
            rows={shownTouches}
            rowId={(row) => row.network}
            label="Attribution model comparison"
            filterable={false}
            columns={[
              { key: "network", header: "Channel", primary: true, cell: (row) => networkOf(row.network).label },
              ...(["First touch", "Last touch", "Linear"] as const).map((name) => ({ key: name, header: name, align: "end" as const, cell: (row: { firstTouch: number; lastTouch: number; assisted: number }) => String(credit(row, name)) })),
              { key: "spread", header: "Spread", align: "end", cell: (row) => { const values = (["First touch", "Last touch", "Linear"] as const).map((name) => credit(row, name)); return String(Math.max(...values) - Math.min(...values)); } },
            ]}
            summary={<span>{unattributed} orders are unattributed under every model.</span>}
          />
        </Card>
        <Row gap={3} wrap>
          <Field label="Attribution model"><Select value={model} onChange={(event) => setModel(event.target.value as (typeof MODELS)[number])}>{MODELS.map((item) => <option key={item}>{item}</option>)}</Select></Field>
          <Button variant="secondary" onClick={() => context.openOverlay("Attribution model", { model })}>How this model works</Button>
        </Row>
        <Card title={`${model} by channel`} subtitle="The same stored touches, read a different way" flush>
          <DataGrid
            rows={model === "Unattributed" ? [{ network: "none", firstTouch: unattributed, lastTouch: unattributed, assisted: unattributed }] : shownTouches}
            rowId={(row) => row.network}
            label="Attribution by model"
            filterable={false}
            columns={[
              { key: "network", header: "Channel", primary: true, cell: (row) => (row.network === "none" ? "No campaign recorded" : networkOf(row.network).label) },
              { key: "value", header: "Conversions", align: "end", cell: (row) => String(model === "First touch" ? row.firstTouch : model === "Last touch" ? row.lastTouch : model === "Linear" ? Math.round((row.firstTouch + row.lastTouch + row.assisted) / 3) : row.assisted) },
              { key: "share", header: "Share of orders", align: "end", cell: (row) => `${orders.length === 0 ? 0 : Math.round(((model === "First touch" ? row.firstTouch : model === "Last touch" ? row.lastTouch : row.assisted) / orders.length) * 100)}%` },
            ]}
          />
        </Card>
        <Notice tone="warning" title="A model is a choice, not a measurement">
          Changing the model changes which channel gets the credit without changing a single order. Nothing here establishes that a channel caused a purchase; seasonality, the showroom and word of mouth are all unmeasured here.
        </Notice>
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      {filterNote}
      <StatRow>
        <Stat label="Orders" value={String(orders.length)} meta="Excluding cancellations" />
        <Stat label="Claimed conversions" value={String(totals.conversions)} meta="Across all channels" />
        <Stat label="Unattributed" value={String(unattributed)} meta={`${orders.length === 0 ? 0 : Math.round((unattributed / orders.length) * 100)}% of orders`} onClick={() => context.openOverlay("metric notes", { metric: "unattributed" })} />
        <Stat label="Consent-limited tracking" value="Unavailable" unavailable meta="No analytics consent record exists" />
      </StatRow>
      <Card title="Channels, as recorded" flush>
        <DataGrid
          rows={channels}
          rowId={(row) => row.network}
          label="Channel attribution"
          filterable={false}
          onOpen={(id) => context.openOverlay("source inspector", { network: id })}
          columns={[
            { key: "network", header: "Channel", primary: true, cell: (row) => networkOf(row.network).label },
            { key: "impressions", header: "Impressions", align: "end", cell: (row) => (row.impressions ? row.impressions.toLocaleString(org.locale) : <span className="ds-subtle">Not recorded</span>), sortValue: (row) => row.impressions },
            { key: "clicks", header: "Clicks", align: "end", cell: (row) => (row.clicks ? row.clicks.toLocaleString(org.locale) : <span className="ds-subtle">Not recorded</span>), sortValue: (row) => row.clicks },
            { key: "conv", header: "Conversions", align: "end", cell: (row) => String(row.conversions) },
            { key: "revenue", header: "Claimed revenue", align: "end", cell: (row) => context.money(row.revenueMinor), sortValue: (row) => row.revenueMinor },
            { key: "confidence", header: "Confidence", cell: (row) => <Pill tone={row.impressions === 0 ? "warning" : "info"}>{row.impressions === 0 ? "No platform data" : "Self-reported field"}</Pill> },
          ]}
        />
      </Card>
      <Notice tone="warning" title="Where the uncertainty is">
        Impressions and clicks are fields on campaign records, entered here. Orders are separate records. Nothing joins a click to an order in this workspace, so every figure above is an association at best. {unattributed} order{unattributed === 1 ? "" : "s"} are shown as unattributed rather than distributed across channels.
      </Notice>
    </Stack>
  );
}

/* ---------------------------- MARKET-012 ---------------------------- */

export function MarketTemplates({ context, state }: { context: ScreenContext; state: string }) {
  const templates = useCollection("templates");
  const marketKinds = ["email", "post", "ad", "plan", "page"];
  const mine = templates.filter((template) => marketKinds.includes(String(template.fields.kind)));
  const rows = state === "All" ? mine
    : state === "Saved" ? mine.filter((template) => template.status === "review" || template.status === "draft")
      : state === "Approved" ? mine.filter((template) => template.status === "approved")
        : mine.filter((template) => template.status === "archived");

  if (rows.length === 0) {
    return <Empty title={`No ${state.toLowerCase()} templates`} icon={<PenLine size={20} />} action={<Button variant="primary" onClick={() => context.openOverlay("Template editor")}>Create template</Button>} />;
  }

  return (
    <Grid>
      {rows.map((template) => (
        <Card key={template.id} span={4} title={template.title} subtitle={template.summary}
          actions={<Row gap={1}><Pill>{String(template.fields.kind)}</Pill><Pill tone={template.status === "approved" ? "success" : template.status === "archived" ? "neutral" : "warning"}>{template.status}</Pill></Row>}
          footer={<>
            <Button size="sm" variant={context.selectedId === template.id ? "primary" : "secondary"} aria-pressed={context.selectedId === template.id} onClick={() => context.select(context.selectedId === template.id ? undefined : template.id)}>{context.selectedId === template.id ? "Selected" : "Select"}</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(template.id); context.openOverlay("Template editor", { id: template.id }); }}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(template.id); context.openOverlay("approval", { id: template.id }); }}>Review</Button>
            <Button size="sm" variant="ghost" onClick={() => { context.select(template.id); context.openOverlay("global update impact", { id: template.id }); }}>Impact</Button>
          </>}>
          <Properties rows={[
            { label: "Version", value: String(template.fields.version ?? 1) },
            { label: "Published", value: template.fields.publishedVersion ? `version ${String(template.fields.publishedVersion)}` : "Not published" },
            { label: "Used by", value: `${template.fields.usedBy ?? 0} live items` },
            { label: "Brand checked", value: template.fields.brandChecked === true ? <Pill tone="success">Yes</Pill> : <Pill tone="warning">Not checked</Pill> },
            { label: "Updated", value: context.relative(template.updatedAt) },
          ]} />
        </Card>
      ))}
    </Grid>
  );
}

/* ---------------------------- Shared network preview ---------------------------- */

export function NetworkPreview({ network, caption, media, accountName }: { network: string; caption: string; media?: string; accountName?: string }) {
  const spec = networkOf(network);
  const over = caption.length > spec.limit;
  return (
    <Stack gap={2}>
      <div className="t4-net">
        <div className="t4-net-head">
          <span className="ds-avatar" aria-hidden="true" style={{ background: "var(--accent)" }}>N</span>
          <span className="ds-grow">{accountName ?? "northline.atelier"}</span>
          <Pill tone="warning">Not connected</Pill>
        </div>
        {media ? <div className="t4-net-media">{media}</div> : null}
        <div className="t4-net-body">{caption || "No caption yet."}</div>
        <div className="t4-net-foot">{spec.label} · {spec.media}</div>
      </div>
      <Row gap={2}>
        <span className={over ? "ds-field-error" : "ds-subtle"}>{caption.length} / {spec.limit.toLocaleString()} characters</span>
        {over && <Pill tone="danger">Over the {spec.label} limit</Pill>}
      </Row>
      {over && <Notice tone="danger" title={`${spec.label} would reject this caption`}>Shorten the caption to {spec.limit.toLocaleString()} characters. The preview is rendered from the provider's documented limits, not from a live check.</Notice>}
    </Stack>
  );
}

