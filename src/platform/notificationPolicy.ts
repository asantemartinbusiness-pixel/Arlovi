import type { AttentionItem, Priority } from "./attention";

/** Platform-wide presentation and routing contract, never an authority grant. */
export type NotificationCategory = "messages" | "work" | "projects" | "agents" | "routine" | "security";
export type NotificationDeliveryMode = "immediate" | "digest" | "quiet";
export type NotificationSurface = "drawer" | "inbox" | "inline" | "banner" | "toast" | "critical";

export interface PersonalNotificationPreferences {
  focusMode: boolean;
  modes: Record<NotificationCategory, NotificationDeliveryMode>;
  preview: "standard" | "private";
}

export const DEFAULT_NOTIFICATION_PREFERENCES: PersonalNotificationPreferences = {
  focusMode: false,
  modes: {
    messages: "immediate", work: "immediate", projects: "digest",
    agents: "digest", routine: "digest", security: "immediate",
  },
  preview: "private",
};

export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string; detail: string }[] = [
  { id: "messages", label: "Messages & mentions", detail: "People contacting or mentioning you" },
  { id: "work", label: "Work & approvals", detail: "Assigned work, deadlines and decisions" },
  { id: "projects", label: "Projects & documents", detail: "Reviews, comments and collaboration" },
  { id: "agents", label: "AI Workforce", detail: "Mission completion, blocks and automation" },
  { id: "routine", label: "Routine updates", detail: "Reports, changes and non-urgent activity" },
  { id: "security", label: "Security", detail: "Account and access protection" },
];

export const NATIVE_APP_NOTIFICATION_SOURCES = {
  Headquarters: ["HQ", "INBOX", "ASSET", "ADMIN"],
  Intelligence: ["AI", "BRAIN", "TEAM", "MISSION", "AUTO", "ANALYTICS"],
  Operations: ["FIN", "CRM", "HR", "PROJECT", "COMMS", "CARE", "LEGAL"],
  Growth: ["MARKET", "COMMERCE", "BOOK", "PROC", "PORTAL"],
  Studio: ["DOCS", "SHEETS", "PRESENT", "DESIGN", "PHOTO", "LAYOUT", "VIDEO", "MOTION"],
  Platform: ["WEB", "BUILD", "FORMS", "CONNECT", "IT"],
} as const;

/** P0 is reserved for genuine security or data-protection risk; severity alone never authorises an action. */
export function notificationCategory(item: AttentionItem): NotificationCategory {
  const value = `${item.group} ${item.kind}`.toLowerCase();
  if (/security|incident|access|authentication/.test(value) || (item.kind === "system" && item.priority <= "P1")) return "security";
  if (item.kind === "mention" || /message|conversation|communication/.test(value)) return "messages";
  if (item.kind === "approval" || item.kind === "assignment" || item.kind === "overdue") return "work";
  if (item.kind === "interruption" || /mission|agent|automation|ai workforce/.test(value)) return "agents";
  if (/project|document|review|studio/.test(value)) return "projects";
  return "routine";
}

/** A delivery decision. This never hides the event from the persistent in-app feed. */
export function mayInterrupt(
  item: AttentionItem,
  preferences: PersonalNotificationPreferences,
  currentlyViewingSource = false,
): boolean {
  const category = notificationCategory(item);
  if (item.resolved) return false;
  if (item.priority === "P0" || category === "security" && item.priority === "P1") return true;
  if (currentlyViewingSource) return false;
  if (preferences.focusMode) return false;
  return preferences.modes[category] === "immediate" && item.priority <= "P3";
}

export function notificationSurface(item: AttentionItem): NotificationSurface {
  if (item.priority === "P0" && notificationCategory(item) === "security") return "critical";
  if (item.kind === "approval" || item.kind === "assignment" || item.kind === "interruption") return "inbox";
  if (item.kind === "system" && item.priority <= "P1") return "banner";
  return "drawer";
}

export function groupNotificationUpdates<T extends AttentionItem>(items: T[]): { id: string; label: string; items: T[] }[] {
  const ordered = [...items].sort((a,b)=>a.priority.localeCompare(b.priority) || b.at.localeCompare(a.at));
  const groups = new Map<string, T[]>();
  for (const item of ordered) {
    // Never collapse independent decisions, security alerts or explicit mentions.
    const isUnique = item.kind === "approval" || item.kind === "assignment" || item.kind === "interruption"
      || item.kind === "mention" || notificationCategory(item) === "security";
    const key = isUnique ? item.id : `${item.kind}:${item.group}:${item.entityId ?? item.sourceId ?? ""}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups].map(([id, rows]) => ({
    id, label: rows.length > 1 ? `${rows.length} updates · ${rows[0].group}` : rows[0].group, items: rows,
  }));
}

export function isSnoozed(until: string | undefined, now = new Date()): boolean {
  if (!until) return false;
  const end = Date.parse(until);
  return Number.isFinite(end) && end > now.getTime();
}

export function isUrgent(priority: Priority): boolean { return priority === "P0" || priority === "P1"; }
