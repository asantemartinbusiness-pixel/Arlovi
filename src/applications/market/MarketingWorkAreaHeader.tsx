import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ScreenContext } from "@/platform/registry";
import { marketAreaCounts, type MarketingArea } from "./marketAreaModel";
import { useMarketData } from "./data";
import "./marketing-workareas.css";

const WORKSPACES: Record<MarketingArea, { label: string; description: string; next: string; nextPath: string }> = {
  calendar: {
    label: "Plan the publishing schedule",
    description: "Dates and review states are stored locally; scheduled content cannot be sent to a provider from this workspace.",
    next: "Social publishing",
    nextPath: "social",
  },
  social: {
    label: "Prepare posts and review delivery",
    description: "Drafts, queued items and failures are local. No social account is authorised to publish.",
    next: "Content calendar",
    nextPath: "calendar",
  },
  email: {
    label: "Build email communications",
    description: "Preview audiences and prepare draft emails; no mail provider is connected and delivery metrics are unavailable.",
    next: "Audience segments",
    nextPath: "audiences",
  },
  audiences: {
    label: "Understand who you may reach",
    description: "Eligibility is calculated from locally stored contacts, consent rules and exclusions.",
    next: "Email campaigns",
    nextPath: "email",
  },
};

export function MarketingWorkAreaHeader({ context, area }: { context: ScreenContext; area: MarketingArea }) {
  const data = useMarketData();
  const details = WORKSPACES[area];
  // The collection hook returns a keyed record; declare the required
  // collections explicitly so work-area counts are type-safe and resilient.
  const counts = marketAreaCounts(area, {
    socialPosts: data.socialPosts ?? [],
    campaigns: data.campaigns ?? [],
    audiences: data.audiences ?? [],
    contacts: data.contacts ?? [],
    templates: data.templates ?? [],
  });
  return <section className="t4-workarea-head" aria-label={context.screen.title + " workspace summary"}>
    <div className="t4-workarea-head-main">
      <span className="t4-workarea-eyebrow">MARKETING / {area.toUpperCase()}</span>
      <strong>{details.label}</strong>
      <p>{details.description}</p>
    </div>
    <dl className="t4-workarea-head-stats">
      {counts.map(item => <div key={item.label}>
        <dt>{item.label}</dt>
        <dd>{item.count}</dd>
      </div>)}
    </dl>
    <Link to={`/o/${context.org.slug}/market/${details.nextPath}`} className="t4-workarea-next">
      {details.next} <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  </section>;
}
