import raw from "@/generated/catalog.json";
import { matchPath, type RouteScreen } from "@/app/match";

export interface AppInfo {
  code: string;
  name: string;
  purpose: string;
  roles: string;
  entities: string;
}

export interface ScreenInfo extends RouteScreen {
  archetype: string;
  applicationCode: string;
  applicationName: string;
  purpose: string;
  regions: string[];
  tabs: string[];
  actions: string[];
  overlays: string[];
  ai: string;
  edge: string;
  collection: string;
  sampleId: string;
}

export const applications = raw.applications as AppInfo[];
export const screens = raw.screens as ScreenInfo[];

export const NAV_GROUPS = [
  { label: "Headquarters", codes: ["HQ", "INBOX", "ADMIN", "ASSET"] },
  { label: "Intelligence", codes: ["AI", "BRAIN", "TEAM", "MISSION", "AUTO", "ANALYTICS"] },
  { label: "Operations", codes: ["FIN", "CRM", "HR", "PROJECT", "COMMS", "CARE", "LEGAL"] },
  { label: "Growth", codes: ["MARKET", "COMMERCE", "BOOK", "PROC", "PORTAL"] },
  { label: "Studio", codes: ["DOCS", "SHEETS", "PRESENT", "DESIGN", "PHOTO", "LAYOUT", "VIDEO", "MOTION"] },
  { label: "Platform", codes: ["WEB", "BUILD", "FORMS", "CONNECT", "IT"] },
];

export function appByCode(code: string): AppInfo | undefined {
  return applications.find((app) => app.code === code);
}

export function screenPath(screen: ScreenInfo, slug: string, id?: string): string {
  return screen.route
    .replace(":org", slug)
    .replace(":id", id || screen.sampleId)
    .replace(":slug", "showroom-consult");
}

export function appEntry(code: string, slug: string): string {
  const screen = screens.find((item) => item.applicationCode === code);
  return screen ? screenPath(screen, slug) : `/o/${slug}/hq/home`;
}

/**
 * A contextual native-app navigation item must never manufacture a sample ID.
 * Detail links are available only while the matching record is open in this
 * organisation and application. List/root screens remain available everywhere.
 */
export function nativeNavPath(
  target: ScreenInfo,
  slug: string,
  current: ReturnType<typeof findScreen>,
): string | null {
  const needsId = /:id\b/.test(target.route);
  const needsSlug = /:slug\b/.test(target.route);
  if (!needsId && !needsSlug) return target.route.replace(":org", slug);
  if (!current || current.screen.applicationCode !== target.applicationCode ||
      current.screen.collection !== target.collection) return null;
  if (needsId && !current.params.id) return null;
  if (needsSlug && !current.params.slug) return null;
  return target.route
    .replace(":org", slug)
    .replace(":id", encodeURIComponent(current.params.id ?? ""))
    .replace(":slug", encodeURIComponent(current.params.slug ?? ""));
}

export function findScreen(pathname: string): { screen: ScreenInfo; params: Record<string, string> } | null {
  const match = matchPath(pathname, screens);
  if (!match) return null;
  return { screen: match.screen as ScreenInfo, params: match.params };
}
