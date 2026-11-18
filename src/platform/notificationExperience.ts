import type { AttentionItem, Priority } from "@/platform/attention";

export type NotificationCategory = "messages" | "work" | "projects" | "agents" | "routine" | "security";
export type NotificationFrequency = "immediate" | "digest" | "quiet";
export type PreviewPrivacy = "limited" | "full";

export interface NotificationPreferences {
  categories: Record<NotificationCategory, NotificationFrequency>;
  focusMode: boolean;
  previews: PreviewPrivacy;
  sound: boolean;
  /** These channels are only descriptive until connected services exist. */
  digestTime: string;
}

export const NOTIFICATION_CATEGORIES: { id: NotificationCategory; label: string; description: string }[] = [
  { id: "messages", label: "Messages & mentions", description: "Direct conversations, @mentions and replies" },
  { id: "work", label: "Assigned work & decisions", description: "Approvals, assignments, overdue work and escalations" },
  { id: "projects", label: "Projects & documents", description: "Collaboration, comments and relevant changes" },
  { id: "agents", label: "AI workforce", description: "Missions, automations and agent activity" },
  { id: "routine", label: "Reports & routine updates", description: "Informational updates that can wait" },
  { id: "security", label: "Security & account access", description: "Important system and identity events" },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  categories: {
    messages: "immediate",
    work: "immediate",
    projects: "digest",
    agents: "digest",
    routine: "digest",
    security: "immediate",
  },
  focusMode: false,
  previews: "limited",
  sound: false,
  digestTime: "09:00",
};

/** Scope demo/browser preferences to an actual active actor, never just a role. */
export function notificationPreferenceKey(orgId: string, actor: string): string {
  return JSON.stringify([orgId, actor.trim().toLowerCase()]);
}

const frequencies = new Set<NotificationFrequency>(["immediate", "digest", "quiet"]);
export function normalizeNotificationPreferences(value: Partial<NotificationPreferences> | undefined): NotificationPreferences {
  const categoryValue = value?.categories ?? DEFAULT_NOTIFICATION_PREFERENCES.categories;
  const categories = { ...DEFAULT_NOTIFICATION_PREFERENCES.categories };
  for (const { id } of NOTIFICATION_CATEGORIES) {
    if (frequencies.has(categoryValue[id])) categories[id] = categoryValue[id];
  }
  // No self-service setting can silence security events from the in-app feed.
  categories.security = "immediate";
  return {
    categories,
    focusMode: value?.focusMode === true,
    previews: value?.previews === "full" ? "full" : "limited",
    sound: value?.sound === true,
    digestTime: typeof value?.digestTime === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.digestTime)
      ? value.digestTime : DEFAULT_NOTIFICATION_PREFERENCES.digestTime,
  };
}

export function notificationCategory(item: AttentionItem): NotificationCategory {
  if (item.kind === "system" && (item.priority === "P0" || item.priority === "P1")) return "security";
  if (item.kind === "mention") return "messages";
  if (item.kind === "approval" || item.kind === "overdue" || item.kind === "assignment" || item.kind === "interruption") return "work";
  if (/mission|automation|workforce|agent/i.test(item.group)) return "agents";
  if (/project|document|studio/i.test(item.group)) return "projects";
  return "routine";
}

/** Preferences control interruptions, NOT retention or access to events. */
export function attentionPresentation(item: AttentionItem, preferences: NotificationPreferences): "interrupt" | "quiet" | "digest" {
  if (item.priority === "P0" && notificationCategory(item) === "security") return "interrupt";
  if (preferences.focusMode) return "quiet";
  const configured = preferences.categories[notificationCategory(item)];
  if (configured === "quiet" || configured === "digest") return configured;
  if (item.priority === "P0" || item.priority === "P1") return "interrupt";
  return "quiet";
}

/** An explicit route must remain inside this exact organisation, including after URL parsing. */
export function safeNotificationPath(raw: string | undefined, orgSlug: string): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const url = new URL(raw, "https://arlovi.invalid");
    const prefix = "/o/" + encodeURIComponent(orgSlug) + "/";
    if (url.origin !== "https://arlovi.invalid" || !url.pathname.startsWith(prefix)) return null;
    return url.pathname + url.search + url.hash;
  } catch { return null; }
}

export type NoticeSurface = "badge" | "toast" | "inline" | "banner" | "modal";
export interface AlertContract {
  priority: Priority;
  surface: NoticeSurface;
  requiresAction: boolean;
  accessibleRole: "status" | "alert";
}
/** Shared UI contract; apps supply business events, not their own intrusive popups. */
export function alertContract(priority: Priority, requiresAction: boolean): AlertContract {
  if (priority === "P0") return { priority, surface: "modal", requiresAction, accessibleRole: "alert" };
  if (priority === "P1") return { priority, surface: "banner", requiresAction, accessibleRole: "alert" };
  if (requiresAction) return { priority, surface: "badge", requiresAction, accessibleRole: "status" };
  if (priority === "P4" || priority === "P5") return { priority, surface: "inline", requiresAction, accessibleRole: "status" };
  return { priority, surface: "toast", requiresAction, accessibleRole: "status" };
}
