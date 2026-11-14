import {
  Activity, Boxes, Brain, Briefcase, Building2, CalendarClock, Camera, CircleDollarSign,
  ClipboardList, Clock, Cpu, Database, FileSpreadsheet, FileText, Film, Globe, Headphones,
  Image, Inbox, LayoutDashboard, LayoutTemplate, LifeBuoy, Megaphone, MessageSquare, Microscope,
  Network, PenTool, Plug, Presentation, Rocket, Scale, Server, ShoppingBag, Sparkles, SquareCode,
  Target, Truck, Users, Workflow,
} from "lucide-react";
import type { ComponentType } from "react";

export interface AppNavEntry {
  code: string;
  short: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
}

export interface NavGroup {
  label: string;
  apps: AppNavEntry[];
}

/** Six groups, matching the approved headquarters information architecture. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Headquarters",
    apps: [
      { code: "HQ", short: "Headquarters", icon: Building2 },
      { code: "INBOX", short: "Inbox", icon: Inbox },
      { code: "ASSET", short: "Assets", icon: Image },
      { code: "ADMIN", short: "Administration", icon: ClipboardList },
    ],
  },
  {
    label: "Intelligence",
    apps: [
      { code: "AI", short: "Ask Arlovi", icon: Sparkles },
      { code: "BRAIN", short: "Company Brain", icon: Brain },
      { code: "TEAM", short: "AI Workforce", icon: Users },
      { code: "MISSION", short: "Missions", icon: Rocket },
      { code: "AUTO", short: "Automation", icon: Workflow },
      { code: "ANALYTICS", short: "Analytics", icon: Activity },
    ],
  },
  {
    label: "Operations",
    apps: [
      { code: "FIN", short: "Finance", icon: CircleDollarSign },
      { code: "CRM", short: "CRM", icon: Target },
      { code: "HR", short: "People", icon: Briefcase },
      { code: "PROJECT", short: "Projects", icon: LayoutDashboard },
      { code: "COMMS", short: "Communications", icon: MessageSquare },
      { code: "CARE", short: "Customer Care", icon: Headphones },
      { code: "LEGAL", short: "Legal", icon: Scale },
    ],
  },
  {
    label: "Growth",
    apps: [
      { code: "MARKET", short: "Marketing", icon: Megaphone },
      { code: "COMMERCE", short: "Commerce", icon: ShoppingBag },
      { code: "BOOK", short: "Bookings", icon: CalendarClock },
      { code: "PROC", short: "Procurement", icon: Truck },
      { code: "PORTAL", short: "Portals", icon: LifeBuoy },
    ],
  },
  {
    label: "Studio",
    apps: [
      { code: "DOCS", short: "Docs", icon: FileText },
      { code: "SHEETS", short: "Sheets", icon: FileSpreadsheet },
      { code: "PRESENT", short: "Present", icon: Presentation },
      { code: "DESIGN", short: "Design", icon: PenTool },
      { code: "PHOTO", short: "Photo", icon: Camera },
      { code: "LAYOUT", short: "Layout", icon: LayoutTemplate },
      { code: "VIDEO", short: "Video", icon: Film },
      { code: "MOTION", short: "Motion", icon: Cpu },
    ],
  },
  {
    label: "Platform",
    apps: [
      { code: "WEB", short: "Websites", icon: Globe },
      { code: "BUILD", short: "App Builder", icon: SquareCode },
      { code: "FORMS", short: "Forms", icon: ClipboardList },
      { code: "CONNECT", short: "Integrations", icon: Plug },
      { code: "IT", short: "IT Operations", icon: Server },
    ],
  },
];

export const APP_ENTRIES: Record<string, AppNavEntry> = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.apps.map((app) => [app.code, app])),
);

export const SPARE_ICONS = { Boxes, Clock, Database, Microscope, Network };

/** Mobile bottom navigation adapts to the group the person is working in. */
export function mobileNavFor(code: string): { label: string; code: string }[] {
  const group = NAV_GROUPS.find((item) => item.apps.some((app) => app.code === code));
  const base = [{ label: "Home", code: "HQ" }, { label: "Inbox", code: "INBOX" }];
  const current = APP_ENTRIES[code];
  const peers = (group?.apps ?? []).filter((app) => !base.some((item) => item.code === app.code) && app.code !== code);
  const entries = [
    ...base,
    ...(current && !base.some((item) => item.code === code) ? [{ label: current.short, code }] : []),
    ...peers.map((app) => ({ label: app.short, code: app.code })),
  ];
  const seen = new Set<string>();
  return entries.filter((item) => (seen.has(item.code) ? false : (seen.add(item.code), true))).slice(0, 4);
}
