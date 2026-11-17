import { ArrowLeft, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { Pill } from "@/design-system";
import type { ScreenContext } from "@/platform/registry";
import { useRecord } from "@/platform/workspace";
import { campaignChannels } from "./campaignLibraryModel";
import { networkOf, useMarketData } from "./data";
import "./campaign-library.css";

export function CampaignDetailContext({ context }: { context: ScreenContext }) {
  const data = useMarketData();
  const routed = useRecord(context.params.id);
  const campaign = routed ?? data.campaigns.find(item => item.id === context.params.id);
  if (!campaign) return null;

  const channels = campaignChannels(campaign);
  const budget = Number(campaign.fields.budgetMinor ?? campaign.amountMinor ?? 0);
  const spent = Number(campaign.fields.spentMinor ?? 0);
  const approval = String(campaign.fields.approval ?? "draft");
  const delivery = String(campaign.fields.delivery ?? "not_connected");
  const tone = campaign.status === "active" || campaign.status === "approved" ? "success"
    : campaign.status === "approval" ? "warning" : "neutral";

  return <section className="t4-campaign-detail-context" aria-label="Campaign plan summary">
    <div className="t4-campaign-detail-main">
      <Link className="t4-campaign-detail-back" to={`/o/${context.org.slug}/market/campaigns`}>
        <ArrowLeft size={15} aria-hidden="true" /> All campaigns
      </Link>
      <span className="t4-campaign-eyebrow">CAMPAIGN / {String(campaign.fields.objective ?? "PLAN").toUpperCase()}</span>
      <h2>{campaign.title}</h2>
      <p>{campaign.summary}</p>
      <div className="t4-campaign-detail-labels">
        <Pill tone={tone} dot>{campaign.status === "approval" ? "Awaiting approval" : campaign.status.replaceAll("_", " ")}</Pill>
        <span>Plan review: {approval.replaceAll("_", " ")}</span>
        <span>{delivery === "not_connected" ? "Delivery provider not connected" : `Delivery record: ${delivery.replaceAll("_", " ")}`}</span>
      </div>
    </div>
    <dl className="t4-campaign-detail-stats">
      <div><dt>Budget</dt><dd>{context.money(budget)}</dd></div>
      <div><dt>Committed locally</dt><dd>{context.money(spent)}</dd></div>
      <div><dt>Channels</dt><dd>{channels.length ? channels.map(id => networkOf(id).label).join(", ") : "Not configured"}</dd></div>
      <div><dt>Window</dt><dd>{campaign.startAt && campaign.endAt
        ? `${context.date(campaign.startAt)} – ${context.date(campaign.endAt)}`
        : "Not scheduled"}</dd></div>
    </dl>
    <Link className="t4-campaign-detail-calendar" to={`/o/${context.org.slug}/market/calendar`}>
      <CalendarDays size={16} aria-hidden="true" /> Content calendar
    </Link>
  </section>;
}
