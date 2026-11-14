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

export function findScreen(pathname: string): { screen: ScreenInfo; params: Record<string, string> } | null {
  const match = matchPath(pathname, screens);
  if (!match) return null;
  return { screen: match.screen as ScreenInfo, params: match.params };
}
