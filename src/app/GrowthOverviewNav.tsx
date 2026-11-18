import { ArrowUpRight, CornerDownRight } from "lucide-react";
import { Link } from "react-router-dom";
import { canOpen } from "@/platform/policy";
import type { ScreenContext } from "@/platform/registry";
import { GROWTH_WORKFLOWS, growthDestinations, growthPeerDestination, type GrowthCode } from "@/app/growthDirectory";
import "./growth-navigation.css";

/**
 * Compact application-level journey rail for Growth entry screens.
 * Uses only registered record-independent routes and allowed peer apps.
 */
export function GrowthOverviewNav({ context, code }: { context: ScreenContext; code: GrowthCode }) {
  const workflow = GROWTH_WORKFLOWS[code];
  const destinations = growthDestinations(code, context.org.slug)
    .filter(link => link.to !== context.screen.route.replace(":org", context.org.slug));
  const peer = growthPeerDestination(code, context.org.slug);

  return <section className="growth-workflow" aria-label={workflow.appName + " workflow shortcuts"}>
    <div className="growth-workflow-copy">
      <span className="growth-workflow-eyebrow">GROWTH / {workflow.stage.toUpperCase()}</span>
      <strong>{workflow.title}</strong>
      <p>{workflow.description}</p>
    </div>
    {destinations.length > 0 && <nav className="growth-workflow-links" aria-label={workflow.appName + " work areas"}>
      {destinations.map(link =>
        <Link key={link.to} to={link.to}>{link.label}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}
    </nav>}
    {code === "PORTAL" && <p className="growth-workflow-detail">
      Choose a portal below to work on its pages, documents, messages, billing or access.
    </p>}
    {canOpen(context.role, peer.code) && <Link className="growth-workflow-peer" to={peer.to}>
      <CornerDownRight size={16} aria-hidden="true" />
      {peer.label}
      <ArrowUpRight size={14} aria-hidden="true" />
    </Link>}
  </section>;
}
