import { OverlaySummary, Pill } from "@/design-system";
import type { OverlayDef, ScreenContext } from "@/platform/registry";
import { liveState } from "./model";
import { useSiteRecord } from "./panels";

/** Overlay head for any overlay that works on the routed site: which site, how many routes, what is true of its state. */
function SiteSummary({ context }: { context: ScreenContext }) {
  const { record, site } = useSiteRecord(context);
  if (!record) return null;
  const state = liveState(record, site);
  const domain = site.domains.find((item) => item.primary) ?? site.domains[0];
  return (
    <OverlaySummary
      title={record.title}
      status={<Pill tone={state.tone} dot>{state.label}</Pill>}
      meta={[`${site.pages.length} ${site.pages.length === 1 ? "route" : "routes"}`, domain ? `${domain.host}${domain.verified ? "" : " · unverified"}` : "No domain"]}
    />
  );
}

export const siteSummary: NonNullable<OverlayDef["summary"]> = ({ close: _close, ...context }) => <SiteSummary context={context} />;
