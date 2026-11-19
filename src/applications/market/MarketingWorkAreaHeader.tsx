import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import type { ScreenContext } from "@/platform/registry";
import { marketAreaCounts, type MarketingArea } from "./marketAreaModel";
import { useMarketData } from "./data";
import "./marketing-workareas.css";

const NEXT: Record<MarketingArea, { next: string; nextPath: string }> = {
  calendar: { next: "Social publishing", nextPath: "social" },
  social: { next: "Content calendar", nextPath: "calendar" },
  email: { next: "Audience segments", nextPath: "audiences" },
  audiences: { next: "Email campaigns", nextPath: "email" },
};

/** One slim line: what is in this work area, and where the work goes next. */
export function MarketingWorkAreaHeader({ context, area }: { context: ScreenContext; area: MarketingArea }) {
  const data = useMarketData();
  const details = NEXT[area];
  const counts = marketAreaCounts(area, data);
  return <section className="t4-workarea-head" aria-label={context.screen.title + " workspace summary"}>
    <dl className="t4-workarea-head-stats">
      {counts.map(item => <div key={item.label}>
        <dd>{item.count}</dd>
        <dt>{item.label}</dt>
      </div>)}
    </dl>
    <Link to={`/o/${context.org.slug}/market/${details.nextPath}`} className="t4-workarea-next">
      Next: {details.next} <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  </section>;
}
