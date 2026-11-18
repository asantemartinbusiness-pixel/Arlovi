import { screens } from "@/app/catalog";
import { NAV_GROUPS } from "@/app/nav";

/**
 * Category copy is deliberately concise: this is the directory, not a second
 * dashboard. Each native application remains responsible for its own records.
 */
export const CATEGORY_OVERVIEWS: Record<string, {
  kicker: string;
  title: string;
  description: string;
}> = {
  Headquarters: {
    kicker: "HEADQUARTERS TOOLS",
    title: "Run your company from one place",
    description: "Company overview, your inbox, shared assets and administration. Enter the native app or jump to a registered work area.",
  },
  Intelligence: {
    kicker: "INTELLIGENCE TOOLS",
    title: "Understand, plan and coordinate",
    description: "Find company knowledge, review insights, organise missions and prepare automations in their own workspaces.",
  },
  Operations: {
    kicker: "OPERATIONS TOOLS",
    title: "Keep day-to-day work moving",
    description: "Manage finances, relationships, people, projects, communications, customer care and legal work with direct access to each work area.",
  },
  Growth: {
    kicker: "GROWTH TOOLS",
    title: "Reach, sell, serve and collaborate",
    description: "Five connected workspaces for marketing, commerce, bookings, procurement and client relationships. Enter an app or choose a work area to continue directly.",
  },
  Studio: {
    kicker: "STUDIO TOOLS",
    title: "Create, refine and deliver",
    description: "Documents, spreadsheets, presentations, design, photography, layout, video and motion each have their own editing workspace. Open a library before choosing a specific project.",
  },
  Platform: {
    kicker: "PLATFORM TOOLS",
    title: "Build, connect and operate",
    description: "Open a native tool or jump straight to a work area. Project editors remain inside their real site, application or form.",
  },
};

/**
 * Select up to four real, record-independent work areas from the registered
 * route catalog. Never turn a sample record or another company's content into
 * a directory shortcut. Does not import or eagerly load native app bundles.
 *
 * Platform and Growth also have curated work-area labels; this acts as the
 * safe source for Headquarters, Intelligence, Operations and Studio.
 */
export function categoryDestinations(code: string, orgSlug: string): { label: string; to: string }[] {
  if (!NAV_GROUPS.some(group => group.apps.some(app => app.code === code))) return [];
  const paths = new Set<string>();
  const destinations: { label: string; to: string }[] = [];
  for (const screen of screens) {
    if (screen.applicationCode !== code) continue;
    const params = [...screen.route.matchAll(/:([a-z][a-z0-9]*)/gi)].map(match => match[1]);
    if (params.some(param => param !== "org")) continue;
    const path = screen.route.replace(":org", orgSlug);
    if (!path.startsWith(`/o/${orgSlug}/`) || paths.has(path)) continue;
    paths.add(path);
    destinations.push({ label: screen.title, to: path });
    if (destinations.length === 4) break;
  }
  return destinations;
}
